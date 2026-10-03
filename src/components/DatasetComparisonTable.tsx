import type { PrimaryVariable } from "../domain/rules/ruleCompiler";
import type { DatasetSimulationRunner } from "../domain/simulation/DatasetSimulationRunner";
import { useRunnersVersion } from "../hooks/useRunnersVersion";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";
import { formatLoss } from "../lib/format";

interface Props {
  rules: RuleWorkspaceEntry[];
  runners: Map<string, DatasetSimulationRunner>;
  primaryVariables: readonly PrimaryVariable[];
}

/** Dataset mode's counterpart to `ComparisonTable` (DESIGN.md §18 Phase 7): named model-parameter columns and epoch/batch/loss instead of x/y. */
export function DatasetComparisonTable({ rules, runners, primaryVariables }: Props) {
  const runnerList = rules.map((r) => runners.get(r.id)).filter((r): r is DatasetSimulationRunner => r !== undefined);
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
            <th>Epoch</th>
            <th>Batch loss</th>
            {primaryVariables.map((v) => (
              <th key={v.name}>{v.name}</th>
            ))}
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
                <td>{current.epoch}</td>
                <td>{formatLoss(current.batchLoss)}</td>
                {primaryVariables.map((v) => (
                  <td key={v.name}>{current.coords[v.name].toFixed(4)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
