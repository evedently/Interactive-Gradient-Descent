import { useMemo } from "react";
import type { DatasetLossGrid } from "../domain/dataset/datasetLossGrid";
import type { PrimaryVariable } from "../domain/rules/ruleCompiler";
import { decimateForDisplay, MAX_RENDERED_TRAJECTORY_POINTS } from "../domain/visualization/decimate";
import { finiteRange } from "../domain/visualization/grid";
import { useRunnersVersion } from "../hooks/useRunnersVersion";
import { useWorkspaceStore } from "../state/workspaceStore";
import { ContourCanvas } from "./contour/ContourCanvas";
import type { ContourTrajectory, LossGridView } from "./contour/drawContour";
import type { DatasetRuleRunnerEntry } from "./MetricCharts";

interface Props {
  entries: DatasetRuleRunnerEntry[];
  grid: DatasetLossGrid;
  primaryVariables: readonly PrimaryVariable[];
  initialValues: Readonly<Record<string, number>>;
}

/**
 * Dataset mode's counterpart to `ContourPlot2D` (DESIGN.md §18 Phase 7
 * extension), synchronized with `DatasetSurface3D` — same grid, same
 * bounds, same trajectories. The initial-values marker is draggable here
 * too; the two views stay in lockstep by both reading/writing the same
 * `datasetInitialValues` store field, never their own local copy. The two
 * primary variables play the roles of the canvas's x and y axes.
 */
export function DatasetContourPlot2D({ entries, grid, primaryVariables, initialValues }: Props) {
  useRunnersVersion(entries.map((e) => e.runner));
  const [aName, bName] = primaryVariables.map((v) => v.name);
  const setDatasetInitialValues = useWorkspaceStore((s) => s.setDatasetInitialValues);
  const setParameterHover = useWorkspaceStore((s) => s.setParameterHover);

  const gridView: LossGridView = useMemo(() => {
    const { min, max } = finiteRange(grid.values);
    return { values: grid.values, resolution: grid.resolution, min, span: max - min || 1 };
  }, [grid]);

  const toPoint = (coords: Record<string, number>) => ({ x: coords[aName], y: coords[bName] });
  const trajectories: ContourTrajectory[] = entries
    .filter((e) => e.rule.visible)
    .map(({ rule, runner }) => ({
      color: rule.color,
      points: decimateForDisplay(runner.trajectory, MAX_RENDERED_TRAJECTORY_POINTS).map((p) => toPoint(p.coords)),
      current: toPoint(runner.current.coords),
    }));

  return (
    <ContourCanvas
      grid={gridView}
      bounds={grid.bounds}
      trajectories={trajectories}
      marker={{ x: initialValues[aName] ?? 0, y: initialValues[bName] ?? 0 }}
      runners={entries.map((e) => e.runner)}
      onMarkerCommit={(point) => setDatasetInitialValues({ [aName]: point.x, [bName]: point.y })}
      onHover={(point) => setParameterHover(point ? { [aName]: point.x, [bName]: point.y } : null)}
    />
  );
}
