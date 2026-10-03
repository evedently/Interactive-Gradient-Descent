import { useState } from "react";
import type { SimulationRunner } from "../domain/simulation/SimulationRunner";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";
import { useRunnersVersion } from "../hooks/useRunnersVersion";
import { formatLoss } from "../lib/format";

interface Props {
  rules: RuleWorkspaceEntry[];
  runners: Map<string, SimulationRunner>;
}

/**
 * Live simulation status, upper-right (spec §7): one compact row per
 * visible rule (iteration, loss, run state), plus any error/warning
 * messages. With multiple rules there is no single "current" reading —
 * see `ComparisonTable` for the fuller side-by-side breakdown. Can be
 * collapsed to just its header so it stops covering the 3D view.
 */
export function StatusHUD({ rules, runners }: Props) {
  const visibleRules = rules.filter((r) => r.visible);
  const runnerList = visibleRules.map((r) => runners.get(r.id)).filter((r): r is SimulationRunner => r !== undefined);
  useRunnersVersion(runnerList);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`status-hud ${collapsed ? "status-hud-collapsed" : ""}`}>
      <div className="status-hud-header">
        <h2>Status</h2>
        <button
          type="button"
          className="status-hud-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Show status" : "Hide status"}
        >
          {collapsed ? "◂" : "▸"}
        </button>
      </div>
      {collapsed ? null : visibleRules.map((rule) => {
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
              <dd>{formatLoss(point.loss)}</dd>
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
