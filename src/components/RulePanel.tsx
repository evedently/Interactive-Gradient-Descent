import { ControlsBar } from "./ControlsBar";
import { ParametersPanel } from "./ParametersPanel";
import { RuleEditor } from "./RuleEditor";
import { RuleLiveValues } from "./RuleLiveValues";
import { RulePanelHeader } from "./RulePanelHeader";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import type { SimulationRunner } from "../domain/simulation/SimulationRunner";
import { useRunnerVersion } from "../hooks/useRunnerVersion";

interface Props {
  rule: RuleWorkspaceEntry;
  runner: SimulationRunner;
  canRemove: boolean;
}

/**
 * One rule's editable panel (DESIGN.md §18 Phase 4): name, color,
 * visibility, and remove controls; its own equation editor, parameter
 * sliders, live state values, and play/pause/reset/step controls. Multiple
 * of these coexist, each with an independent namespace (its own
 * `RuleWorkspaceEntry` and `SimulationRunner`), all sharing the workspace's
 * one loss function and starting point.
 */
export function RulePanel({ rule, runner, canRemove }: Props) {
  useRunnerVersion(runner);
  const noiseLevel = useWorkspaceStore((s) => s.noiseLevel);

  const current = runner.current;
  const editingBlocked = rule.errors.length > 0;

  return (
    <section className={`panel rule-panel ${rule.visible ? "" : "rule-panel-hidden"}`}>
      <RulePanelHeader rule={rule} status={runner.status} canRemove={canRemove} />

      {rule.collapsed ? null : (
        <>
          <RuleEditor ruleId={rule.id} />
          <ParametersPanel runner={runner} />
          <RuleLiveValues runner={runner} />
          <div className="rule-mini-status">
            <span>iter {current.iteration}</span>
            <span>loss {Number.isFinite(current.loss) ? current.loss.toFixed(6) : String(current.loss)}</span>
            <span>
              x,y {current.x.toFixed(4)}, {current.y.toFixed(4)}
            </span>
          </div>
          {noiseLevel > 0 ? (
            <div className="rule-mini-status rule-noise-status">
              <span>true g: {current.gx.toFixed(4)}, {current.gy.toFixed(4)}</span>
              <span>noisy g: {current.noisyGx.toFixed(4)}, {current.noisyGy.toFixed(4)}</span>
            </div>
          ) : null}
          <ControlsBar runner={runner} disabled={editingBlocked} />
          {editingBlocked ? <p className="error-message">Fix the syntax errors above before running this rule.</p> : null}
          {runner.status === "error" ? <p className="error-message">{runner.lastError}</p> : null}
        </>
      )}
    </section>
  );
}
