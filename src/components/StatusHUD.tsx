import type { SimulationRunner } from "../domain/simulation/SimulationRunner";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";
import { useRunnersVersion } from "../hooks/useRunnersVersion";

interface Props {
  rules: RuleWorkspaceEntry[];
  runners: Map<string, SimulationRunner>;
}

/**
 * Live simulation status, upper-right (spec §7): one compact row per
 * visible rule (iteration, loss, run state), plus any error/warning
 * messages. With multiple rules there is no single "current" reading —
 * see `ComparisonTable` for the fuller side-by-side breakdown.
 */
export function StatusHUD({ rules, runners }: Props) {
  const visibleRules = rules.filter((r) => r.visible);
  const runnerList = visibleRules.map((r) => runners.get(r.id)).filter((r): r is SimulationRunner => r !== undefined);
  useRunnersVersion(runnerList);

  return (
    <aside className="status-hud">
      <h2>Status</h2>
      {visibleRules.map((rule) => {
        const runner = runners.get(rule.id);
        if (!runner) return null;
        const point = runner.current;
        const peek = runner.peekUpdate();
        const updateMagnitude = peek.ok ? Math.hypot(peek.dx, peek.dy) : null;
        return (
          <div key={rule.id} className="status-hud-rule">
            <div className="status-hud-rule-name">
              <span className="color-dot" style={{ background: rule.color }} />
              {rule.name}
              <span className={`status-badge status-${runner.status}`}>{runner.status}</span>
            </div>
            <dl>
              <dt>Iteration</dt>
              <dd>{point.iteration}</dd>
              <dt>Elapsed</dt>
              <dd>{(point.elapsedMs / 1000).toFixed(2)}s</dd>
              <dt>Loss</dt>
              <dd>{Number.isFinite(point.loss) ? point.loss.toFixed(6) : String(point.loss)}</dd>
              <dt>Update magnitude</dt>
              <dd>{updateMagnitude !== null ? updateMagnitude.toFixed(6) : "—"}</dd>
            </dl>
            {runner.status === "error" ? <p className="warning-message">{runner.lastError}</p> : null}
            {!peek.ok ? <p className="warning-message">Next step would fail: {peek.message}</p> : null}
          </div>
        );
      })}
    </aside>
  );
}
