import { useEffect, useMemo, useState } from "react";
import { CollapsibleSecondaryPanel } from "./CollapsibleSecondaryPanel";
import { DatasetComparisonTable } from "./DatasetComparisonTable";
import { DatasetContourPlot2D } from "./DatasetContourPlot2D";
import { DatasetPanel } from "./DatasetPanel";
import { DatasetRulePanel } from "./DatasetRulePanel";
import { DatasetSurface3D } from "./DatasetSurface3D";
import { MetricCharts, type DatasetRuleRunnerEntry } from "./MetricCharts";
import { RunControlsPanel } from "./RunControlsPanel";
import { computeDatasetLossGrid, DATASET_SURFACE_RESOLUTION, type DatasetLossGrid } from "../domain/dataset/datasetLossGrid";
import { buildDatasetExperimentCsv } from "../domain/persistence/experimentCsv";
import type { DatasetRunTarget } from "../domain/simulation/DatasetTypes";
import { deriveSeed } from "../domain/simulation/SeededRng";
import { expandBoundsToInclude, resolveDatasetSurfaceBounds, type DatasetSurfaceBoundsState } from "../domain/visualization/datasetBounds";
import { useContinuousRunAll } from "../hooks/useContinuousRunAll";
import { useDatasetRunners } from "../hooks/useDatasetRunners";
import { downloadTextFile } from "../lib/downloadFile";
import { useWorkspaceStore } from "../state/workspaceStore";

/**
 * Dataset mode's workspace (DESIGN.md §7/§18 Phase 7, extended). With
 * exactly two primary variables — the only count this app's UI can
 * currently produce, per §4's scope limit — the center/secondary views
 * show a 3D full-dataset loss surface and a synchronized contour, both
 * evaluated by `computeDatasetLossGrid` and both overlaid with every
 * visible rule's trajectory (height = `fullLoss`, never `batchLoss` —
 * see `DatasetSurface3D`'s own doc comment for why). For any other count
 * of primary variables, a loss surface can't be drawn at all, so this
 * falls back to `MetricCharts` alone, exactly as before this extension.
 * `MetricCharts` itself is never hidden when the surface *is* shown — the
 * per-variable and loss-vs-iteration plots are preserved alongside it.
 */
export function DatasetWorkspaceView() {
  const rules = useWorkspaceStore((s) => s.rules);
  const dataset = useWorkspaceStore((s) => s.dataset);
  const activePerExampleLoss = useWorkspaceStore((s) => s.activePerExampleLoss);
  const primaryVariables = useWorkspaceStore((s) => s.primaryVariables);
  const datasetInitialValues = useWorkspaceStore((s) => s.datasetInitialValues);
  const seed = useWorkspaceStore((s) => s.seed);
  const batchSize = useWorkspaceStore((s) => s.batchSize);
  const datasetRunTargetKind = useWorkspaceStore((s) => s.datasetRunTargetKind);
  const datasetRunTargetValue = useWorkspaceStore((s) => s.datasetRunTargetValue);
  const simLimits = useWorkspaceStore((s) => s.simLimits);
  const stepsPerSecond = useWorkspaceStore((s) => s.stepsPerSecond);
  const addRule = useWorkspaceStore((s) => s.addRule);

  const runners = useDatasetRunners(rules, dataset, activePerExampleLoss, primaryVariables, datasetInitialValues, seed, batchSize, simLimits);
  const ready = dataset !== null && activePerExampleLoss !== null;
  const entries: DatasetRuleRunnerEntry[] = ready ? rules.map((rule) => ({ rule, runner: runners.get(rule.id)! })) : [];
  const canShowSurface = ready && primaryVariables.length === 2;

  // Dataset mode's analogue of surface mode's start-point drag (DESIGN.md
  // §9): pending until the next Reset, never applied mid-run.
  useEffect(() => {
    if (!ready) return;
    for (const { runner } of entries) runner.setInitialValues(datasetInitialValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, ready, datasetInitialValues]);

  useEffect(() => {
    if (!ready) return;
    for (const { rule, runner } of entries) runner.setSeed(deriveSeed(seed, rule.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, ready, seed]);

  // Batch size and the run target take effect immediately, like a parameter (no reset needed).
  useEffect(() => {
    if (!ready) return;
    for (const { runner } of entries) runner.setBatchSize(batchSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, ready, batchSize]);

  useEffect(() => {
    if (!ready) return;
    const target: DatasetRunTarget = datasetRunTargetKind === "continuous" ? null : { kind: datasetRunTargetKind, value: datasetRunTargetValue };
    for (const { runner } of entries) runner.setRunTarget(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, ready, datasetRunTargetKind, datasetRunTargetValue]);

  // Divergence-safety bounds (DESIGN.md §12/§17, Phase 9) take effect on the
  // next step, like batch size — mirrors SurfaceWorkspaceView's own wiring.
  useEffect(() => {
    if (!ready) return;
    for (const { runner } of entries) runner.setSimLimits(simLimits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, ready, simLimits]);

  useContinuousRunAll(entries.map((e) => e.runner), stepsPerSecond);

  // Auto-fit bounds for the loss surface/contour (DESIGN.md §8's auto-fit,
  // adapted to Phase 7's extension): re-seeded only when the problem itself
  // changes (new dataset, newly-compiled per-example loss, or renamed
  // primary variables — see `resolveDatasetSurfaceBounds`'s own doc
  // comment), and otherwise only ever GROWN — never shrunk mid-run, and
  // never reseeded by a start-point change — just enough to keep every
  // visible rule's current point on the grid. This means the (expensive,
  // O(resolution^2 * dataset rows)) grid recomputes only on these discrete
  // events, never on every step and never on a marker drag.
  const [boundsState, setBoundsState] = useState<DatasetSurfaceBoundsState>(() =>
    resolveDatasetSurfaceBounds(null, dataset, activePerExampleLoss, primaryVariables, datasetInitialValues),
  );

  useEffect(() => {
    setBoundsState((current) => resolveDatasetSurfaceBounds(current, dataset, activePerExampleLoss, primaryVariables, datasetInitialValues));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, activePerExampleLoss, primaryVariables]);

  useEffect(() => {
    if (!canShowSurface) return;
    const [aName, bName] = primaryVariables.map((v) => v.name);
    setBoundsState((current) => {
      let next = current.bounds;
      for (const { rule, runner } of entries) {
        if (!rule.visible) continue;
        const coords = runner.current.coords;
        next = expandBoundsToInclude(next, coords[aName], coords[bName]);
      }
      return next === current.bounds ? current : { ...current, bounds: next };
    });
  });

  const bounds = boundsState.bounds;
  const grid: DatasetLossGrid | null = useMemo(() => {
    if (!canShowSurface || !dataset || !activePerExampleLoss) return null;
    return computeDatasetLossGrid(activePerExampleLoss, dataset, primaryVariables, bounds, DATASET_SURFACE_RESOLUTION);
  }, [canShowSurface, dataset, activePerExampleLoss, primaryVariables, bounds]);

  const resetAll = () => {
    for (const { runner } of entries) runner.reset();
  };

  const runAll = () => {
    for (const { runner } of entries) runner.play();
  };

  const exportCsv = () => {
    downloadTextFile("gradient-descent-dataset-experiment.csv", buildDatasetExperimentCsv(rules, runners, primaryVariables), "text/csv");
  };

  return (
    <>
      <div className="left-panel">
        <DatasetPanel />
        <RunControlsPanel />

        {ready ? (
          <>
            <div className="rule-list-toolbar">
              <button onClick={addRule}>+ Add rule</button>
              <button onClick={runAll}>Run all</button>
              <button onClick={resetAll}>Reset all</button>
              <button onClick={exportCsv}>Export CSV</button>
            </div>
            {entries.map(({ rule, runner }) => (
              <DatasetRulePanel key={rule.id} rule={rule} runner={runner} canRemove={rules.length > 1} />
            ))}
          </>
        ) : null}
      </div>

      <div className="center-view dataset-center-view">
        {grid ? (
          <DatasetSurface3D
            entries={entries}
            grid={grid}
            primaryVariables={primaryVariables}
            dataset={dataset!}
            perExampleLoss={activePerExampleLoss!}
            initialValues={datasetInitialValues}
          />
        ) : ready ? (
          <MetricCharts entries={entries} primaryVariables={primaryVariables} />
        ) : (
          <p className="dataset-placeholder">Load a CSV and enter a valid per-example loss to start training.</p>
        )}
      </div>

      <CollapsibleSecondaryPanel>
        {grid ? (
          <>
            <h2>Contour</h2>
            <DatasetContourPlot2D entries={entries} grid={grid} primaryVariables={primaryVariables} initialValues={datasetInitialValues} />
            <MetricCharts entries={entries} primaryVariables={primaryVariables} />
          </>
        ) : null}
        <h2>Comparison</h2>
        {ready ? <DatasetComparisonTable rules={rules} runners={runners} primaryVariables={primaryVariables} /> : null}
      </CollapsibleSecondaryPanel>
    </>
  );
}
