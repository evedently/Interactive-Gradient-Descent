import { useEffect } from "react";
import { CollapsibleSecondaryPanel } from "./CollapsibleSecondaryPanel";
import { ComparisonTable } from "./ComparisonTable";
import { ContourPlot2D } from "./ContourPlot2D";
import { LossFunctionEditor } from "./LossFunctionEditor";
import { RulePanel } from "./RulePanel";
import { ReorderableRuleList } from "./ReorderableRuleList";
import { RunControlsPanel } from "./RunControlsPanel";
import { SettingsGroup } from "./SettingsGroup";
import { SimulationSettingsPanel } from "./SimulationSettingsPanel";
import { StatusHUD } from "./StatusHUD";
import { Surface3D, type RuleRunnerEntry } from "./Surface3D";
import { ViewBoundsPanel } from "./ViewBoundsPanel";
import { buildSurfaceExperimentCsv } from "../domain/persistence/experimentCsv";
import { deriveSeed } from "../domain/simulation/SeededRng";
import { pauseHiddenRunners, playVisibleRunners } from "../domain/simulation/ruleRunControl";
import { useContinuousRunAll } from "../hooks/useContinuousRunAll";
import { useMultiRunners } from "../hooks/useMultiRunners";
import { useRuleEntries } from "../hooks/useRuleEntries";
import { downloadTextFile } from "../lib/downloadFile";
import { useWorkspaceStore } from "../state/workspaceStore";

/** Surface mode's workspace (DESIGN.md §7: "the permanent default"), unchanged from Phase 6 — just relocated out of `App.tsx` so `App.tsx` can route between this and `DatasetWorkspaceView` (Phase 7, §18). */
export function SurfaceWorkspaceView() {
  const activeLoss = useWorkspaceStore((s) => s.activeLoss);
  const rules = useWorkspaceStore((s) => s.rules);
  const startPoint = useWorkspaceStore((s) => s.startPoint);
  const seed = useWorkspaceStore((s) => s.seed);
  const noiseLevel = useWorkspaceStore((s) => s.noiseLevel);
  const simLimits = useWorkspaceStore((s) => s.simLimits);
  const stepsPerSecond = useWorkspaceStore((s) => s.stepsPerSecond);
  const addRule = useWorkspaceStore((s) => s.addRule);

  // One runner per rule, replaced only when the shared resolved loss or
  // that rule's own compiled rule changes (DESIGN.md §9) — see useMultiRunners.
  const runners = useMultiRunners(rules, activeLoss, startPoint, seed, noiseLevel, simLimits);
  const entries: RuleRunnerEntry[] = useRuleEntries(rules, runners);

  // Dragging the start point must not reset an in-progress run (DESIGN.md
  // §9) — it only updates where each rule's future Reset will seed to.
  // Every runner needs this, not just one, now that there can be several.
  useEffect(() => {
    for (const { runner } of entries) runner.setStartPoint(startPoint);
  }, [entries, startPoint]);

  // Same "pending, not immediate" treatment for the seed (DESIGN.md §9:
  // takes effect on the next Reset) — each rule's *derived* seed is pushed
  // in, never the raw workspace seed. Noise level, by contrast, is more
  // like a parameter: it takes effect immediately on the next step.
  useEffect(() => {
    for (const { rule, runner } of entries) runner.setSeed(deriveSeed(seed, rule.id));
  }, [entries, seed]);

  useEffect(() => {
    for (const { runner } of entries) runner.setNoiseLevel(noiseLevel);
  }, [entries, noiseLevel]);

  // Divergence-safety bounds (DESIGN.md §12/§17, Phase 9) take effect on the
  // next step, like noise level — every existing runner needs the update,
  // not just newly-created ones (see useMultiRunners's own doc comment).
  useEffect(() => {
    for (const { runner } of entries) runner.setSimLimits(simLimits);
  }, [entries, simLimits]);

  useContinuousRunAll(entries.map((e) => e.runner), stepsPerSecond);

  const resetAll = () => {
    for (const { runner } of entries) runner.reset();
  };

  // Hidden rules never run: "Run all" skips them, and hiding a running rule pauses it.
  useEffect(() => pauseHiddenRunners(entries), [entries]);

  const runAll = () => playVisibleRunners(entries);

  const exportCsv = () => {
    downloadTextFile("gradient-descent-experiment.csv", buildSurfaceExperimentCsv(rules, runners), "text/csv");
  };

  return (
    <>
      <div className="left-panel">
        <SettingsGroup>
          <LossFunctionEditor />
          <SimulationSettingsPanel />
          <ViewBoundsPanel />
          <RunControlsPanel />
        </SettingsGroup>

        <div className="rule-list-toolbar">
          <button onClick={addRule}>+ Add rule</button>
          <button onClick={runAll}>Run all</button>
          <button onClick={resetAll}>Reset all</button>
          <button onClick={exportCsv}>Export CSV</button>
        </div>

        <ReorderableRuleList
          entries={entries}
          renderEntry={({ rule, runner }) => <RulePanel rule={rule} runner={runner} canRemove={rules.length > 1} />}
        />
      </div>

      <div className="center-view">
        <Surface3D entries={entries} />
        <StatusHUD rules={rules} runners={runners} />
      </div>

      <CollapsibleSecondaryPanel>
        <h2>Contour</h2>
        <ContourPlot2D entries={entries} />
        <h2>Comparison</h2>
        <ComparisonTable rules={rules} runners={runners} />
      </CollapsibleSecondaryPanel>
    </>
  );
}
