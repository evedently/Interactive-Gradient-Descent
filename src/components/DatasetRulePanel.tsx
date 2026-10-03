import { ControlsBar } from "./ControlsBar";
import { ParametersPanel } from "./ParametersPanel";
import { RuleEditor } from "./RuleEditor";
import { RuleLiveValues } from "./RuleLiveValues";
import { RulePanelHeader } from "./RulePanelHeader";
import type { DatasetSimulationRunner } from "../domain/simulation/DatasetSimulationRunner";
import { useRunnerVersion } from "../hooks/useRunnerVersion";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";
import { useWorkspaceStore } from "../state/workspaceStore";

interface Props {
  rule: RuleWorkspaceEntry;
  runner: DatasetSimulationRunner;
  canRemove: boolean;
}

/**
 * Dataset mode's counterpart to `RulePanel` (DESIGN.md §18 Phase 7): same
 * editor/parameters/state-values/controls, but the mini-status row shows
 * epoch/batch/mini-batch-vs-full loss and named model-parameter values
 * instead of x/y/gx/gy — there is no spatial position in dataset mode (§7).
 */
export function DatasetRulePanel({ rule, runner, canRemove }: Props) {
  useRunnerVersion(runner);
  const setFocusedRuleId = useWorkspaceStore((s) => s.setFocusedRuleId);
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
            <span>
              epoch {current.epoch}, batch {current.batchIndex}
            </span>
            <span>batch loss {current.batchLoss.toFixed(6)}</span>
            <span>full loss {current.fullLoss.toFixed(6)}</span>
          </div>
          <div className="rule-mini-status">
            {Object.entries(current.coords).map(([name, value]) => (
              <span key={name}>
                {name} = {value.toFixed(6)}
              </span>
            ))}
          </div>
          {/* Driving a rule by hand makes it the one the data plot's batch highlight and the step inspector follow. */}
          <ControlsBar runner={runner} disabled={editingBlocked} onInteract={() => setFocusedRuleId(rule.id)} />
          {editingBlocked ? <p className="error-message">Fix the syntax errors above before running this rule.</p> : null}
          {runner.status === "error" ? <p className="error-message">{runner.lastError}</p> : null}
        </>
      )}
    </section>
  );
}
