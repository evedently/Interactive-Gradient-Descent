import { useEffect, useMemo, useState } from "react";
import type { CompiledPerExampleLoss, Dataset } from "../domain/dataset/types";
import type { PrimaryVariable } from "../domain/rules/ruleCompiler";
import type { DatasetTrajectoryPoint } from "../domain/simulation/DatasetTypes";
import {
  fitDatasetBounds,
  resolveDatasetSurfaceBounds,
  TrajectoryExtentTracker,
  unionExtents,
  type DatasetSurfaceBoundsState,
} from "../domain/visualization/datasetBounds";
import type { GridBounds } from "../domain/visualization/grid";
import type { DatasetRuleRunnerEntry } from "../components/MetricCharts";
import { useRunnersVersion } from "./useRunnersVersion";

interface Problem {
  dataset: Dataset | null;
  perExampleLoss: CompiledPerExampleLoss | null;
  primaryVariables: readonly PrimaryVariable[];
  initialValues: Readonly<Record<string, number>>;
}

/**
 * The parameter-space window the dataset loss surface/contour render over
 * (DESIGN.md §8's auto-fit, Phase 7 extension).
 *
 * - The home window is reseeded only when the problem itself changes (new
 *   dataset, newly compiled formula, renamed parameters) — never by moving
 *   the start point, which would rescale the surface under the marker.
 * - The rendered window is fitted to the visible, non-diverged trajectories
 *   on every step (`fitDatasetBounds`): it grows as runs explore, never
 *   shrinks mid-run, shrinks back after a Reset or once a run diverges, and
 *   is capped relative to home. The same reference is returned while it
 *   still fits, so the expensive grid only recomputes when it changes.
 */
export function useDatasetViewBounds(entries: DatasetRuleRunnerEntry[], enabled: boolean, problem: Problem): GridBounds {
  const { dataset, perExampleLoss, primaryVariables, initialValues } = problem;
  useRunnersVersion(entries.map((e) => e.runner));

  const [state, setState] = useState<DatasetSurfaceBoundsState>(() =>
    resolveDatasetSurfaceBounds(null, dataset, perExampleLoss, primaryVariables, initialValues),
  );

  useEffect(() => {
    setState((current) => resolveDatasetSurfaceBounds(current, dataset, perExampleLoss, primaryVariables, initialValues));
    // Deliberately not keyed on `initialValues`: see the doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, perExampleLoss, primaryVariables]);

  const [aName, bName] = primaryVariables.map((v) => v.name);
  const tracker = useMemo(() => new TrajectoryExtentTracker<DatasetTrajectoryPoint>((p) => [p.coords[aName], p.coords[bName]]), [aName, bName]);

  useEffect(() => {
    if (!enabled) return;
    const fitted = entries.filter(({ rule, runner }) => rule.visible && runner.status !== "error");
    const extent = unionExtents(fitted.map(({ runner }) => tracker.extentOf(runner.trajectory)));
    setState((current) => {
      const view = fitDatasetBounds(current.view, current.bounds, extent);
      return view === current.view ? current : { ...current, view };
    });
  });

  return state.view;
}
