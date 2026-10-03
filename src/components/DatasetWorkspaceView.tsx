import { useEffect, useMemo } from "react";
import { CollapsibleSecondaryPanel } from "./CollapsibleSecondaryPanel";
import { DatasetComparisonTable } from "./DatasetComparisonTable";
import { DatasetContourPlot2D } from "./DatasetContourPlot2D";
import { DatasetPanel } from "./DatasetPanel";
import { DataModelPlot } from "./dataset/DataModelPlot";
import { PredictPanel } from "./dataset/PredictPanel";
import { StepInspector } from "./dataset/StepInspector";
import { DatasetRulePanel } from "./DatasetRulePanel";
import { DatasetSurface3D } from "./DatasetSurface3D";
import { MetricCharts, type DatasetRuleRunnerEntry } from "./MetricCharts";
import { ReorderableRuleList } from "./ReorderableRuleList";
import { RuleListToolbar } from "./RuleListToolbar";
import { RunControlsPanel } from "./RunControlsPanel";
import { SettingsGroup } from "./SettingsGroup";
import { computeDatasetLossGrid, DATASET_SURFACE_RESOLUTION, type DatasetLossGrid } from "../domain/dataset/datasetLossGrid";
import { buildDatasetExperimentCsv } from "../domain/persistence/experimentCsv";
import type { DatasetRunTarget } from "../domain/simulation/DatasetTypes";
import { deriveSeed } from "../domain/simulation/SeededRng";
import { pauseHiddenRunners } from "../domain/simulation/ruleRunControl";
import { useContinuousRunAll } from "../hooks/useContinuousRunAll";
import { useDatasetRunners } from "../hooks/useDatasetRunners";
import { useDatasetViewBounds } from "../hooks/useDatasetViewBounds";
import { useRuleEntries } from "../hooks/useRuleEntries";
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

  const runners = useDatasetRunners(rules, dataset, activePerExampleLoss, primaryVariables, datasetInitialValues, seed, batchSize, simLimits);
  const ready = dataset !== null && activePerExampleLoss !== null;
  const entries: DatasetRuleRunnerEntry[] = useRuleEntries(rules, runners, ready);
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

  const bounds = useDatasetViewBounds(entries, canShowSurface, {
    dataset,
    perExampleLoss: activePerExampleLoss,
    primaryVariables,
    initialValues: datasetInitialValues,
  });
  const grid: DatasetLossGrid | null = useMemo(() => {
    if (!canShowSurface || !dataset || !activePerExampleLoss) return null;
    return computeDatasetLossGrid(activePerExampleLoss, dataset, primaryVariables, bounds, DATASET_SURFACE_RESOLUTION);
  }, [canShowSurface, dataset, activePerExampleLoss, primaryVariables, bounds]);

  // Hidden rules never run: "Run all" skips them, and hiding a running rule pauses it.
  useEffect(() => pauseHiddenRunners(entries), [entries]);

  const exportCsv = () => {
    downloadTextFile("gradient-descent-dataset-experiment.csv", buildDatasetExperimentCsv(rules, runners, primaryVariables), "text/csv");
  };

  return (
    <>
      <div className="left-panel">
        <SettingsGroup>
          <DatasetPanel />
          <RunControlsPanel />
        </SettingsGroup>

        {ready ? (
          <>
            <RuleListToolbar entries={entries} onExportCsv={exportCsv} />
            <ReorderableRuleList
              entries={entries}
              renderEntry={({ rule, runner }) => <DatasetRulePanel rule={rule} runner={runner} canRemove={rules.length > 1} />}
            />
          </>
        ) : null}
      </div>

      <div className="center-view dataset-center-view">
        {ready ? (
          <>
            <div className="dataset-views">
              <div className="dataset-view-pane">
                <DataModelPlot entries={entries} />
              </div>
              <div className="dataset-view-pane">
                {grid ? (
                  <DatasetSurface3D
                    entries={entries}
                    grid={grid}
                    primaryVariables={primaryVariables}
                    dataset={dataset!}
                    perExampleLoss={activePerExampleLoss!}
                    initialValues={datasetInitialValues}
                  />
                ) : (
                  <MetricCharts entries={entries} primaryVariables={primaryVariables} />
                )}
              </div>
            </div>
            <StepInspector entries={entries} />
          </>
        ) : (
          <p className="dataset-placeholder">Choose a sample or upload a CSV, then pick a model, to start training.</p>
        )}
      </div>

      <CollapsibleSecondaryPanel>
        {ready ? <PredictPanel entries={entries} /> : null}
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
