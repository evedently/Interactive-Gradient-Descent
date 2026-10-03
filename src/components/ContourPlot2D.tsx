import { useMemo } from "react";
import { decimateForDisplay, MAX_RENDERED_TRAJECTORY_POINTS } from "../domain/visualization/decimate";
import { computeLossGrid, finiteRange } from "../domain/visualization/grid";
import { useRunnersVersion } from "../hooks/useRunnersVersion";
import { useWorkspaceStore } from "../state/workspaceStore";
import { ContourCanvas } from "./contour/ContourCanvas";
import type { ContourTrajectory, LossGridView } from "./contour/drawContour";
import type { RuleRunnerEntry } from "./Surface3D";

const RESOLUTION = 60;

interface Props {
  entries: RuleRunnerEntry[];
}

/** Surface mode's contour view: the loss over the presenter's view bounds, every visible rule's path with its pending update vector, and the draggable start point. */
export function ContourPlot2D({ entries }: Props) {
  const activeLossAst = useWorkspaceStore((s) => s.activeLoss.ast);
  const startPoint = useWorkspaceStore((s) => s.startPoint);
  const setStartPoint = useWorkspaceStore((s) => s.setStartPoint);
  const bounds = useWorkspaceStore((s) => s.surfaceBounds);

  useRunnersVersion(entries.map((e) => e.runner));

  const gridView: LossGridView = useMemo(() => {
    const grid = computeLossGrid(activeLossAst, bounds, RESOLUTION);
    const { min, max } = finiteRange(grid.values);
    return { values: grid.values, resolution: RESOLUTION, min, span: max - min || 1 };
  }, [activeLossAst, bounds]);

  const trajectories: ContourTrajectory[] = entries
    .filter((e) => e.rule.visible)
    .map(({ rule, runner }) => {
      const current = runner.current;
      const peek = runner.peekUpdate();
      return {
        color: rule.color,
        points: decimateForDisplay(runner.trajectory, MAX_RENDERED_TRAJECTORY_POINTS),
        current,
        updateTip: peek.ok ? { x: current.x + peek.dx, y: current.y + peek.dy } : undefined,
      };
    });

  return (
    <ContourCanvas
      grid={gridView}
      bounds={bounds}
      trajectories={trajectories}
      marker={startPoint}
      runners={entries.map((e) => e.runner)}
      onMarkerCommit={setStartPoint}
    />
  );
}
