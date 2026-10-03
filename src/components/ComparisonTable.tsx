import type { SimulationRunner } from "../domain/simulation/SimulationRunner";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";
import { useRunnersVersion } from "../hooks/useRunnersVersion";
import { formatLoss } from "../lib/format";

interface Props {
  rules: RuleWorkspaceEntry[];
  runners: Map<string, SimulationRunner>;
}

/** Side-by-side comparison of every rule's current values (spec §6: "Comparing final values in a summary table"). */
export function ComparisonTable({ rules, runners }: Props) {
  const runnerList = rules.map((r) => runners.get(r.id)).filter((r): r is SimulationRunner => r !== undefined);
  useRunnersVersion(runnerList);

  if (rules.length === 0) return null;

  return (
    <div className="comparison-table-wrap">
      <table className="comparison-table">
        <thead>
          <tr>
            <th></th>
            <th>Rule</th>
            <th>Status</th>
            <th>Iter</th>
            <th>Loss</th>
            <th>x</th>
            <th>y</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => {
            const runner = runners.get(rule.id);
            if (!runner) return null;
            const current = runner.current;
            return (
              <tr key={rule.id} className={rule.visible ? "" : "comparison-row-hidden"}>
                <td>
                  <span className="color-dot" style={{ background: rule.color }} />
                </td>
                <td>{rule.name}</td>
                <td>
                  <span className={`status-badge status-${runner.status}`}>{runner.status}</span>
                </td>
                <td>{current.iteration}</td>
                <td>{formatLoss(current.loss)}</td>
                <td>{current.x.toFixed(4)}</td>
                <td>{current.y.toFixed(4)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
