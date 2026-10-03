import { traceBatch, type BatchTrace } from "../../domain/dataset/stepTrace";
import type { PrimaryVariable } from "../../domain/rules/ruleCompiler";
import { pickFocusedEntry } from "../../domain/simulation/ruleRunControl";
import { useRunnersVersion } from "../../hooks/useRunnersVersion";
import { formatLoss } from "../../lib/format";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { CollapsiblePanel } from "../CollapsiblePanel";
import type { DatasetRuleRunnerEntry } from "../MetricCharts";

/** Batch rows beyond this are summarized as "…n more" — the means still cover every row. */
const MAX_ROWS_SHOWN = 12;
const DIGITS = 4;

const fmt = (value: number | null) => (value === null ? "—" : Number.isFinite(value) ? value.toFixed(DIGITS) : String(value));
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(DIGITS)}`;

interface Props {
  entries: DatasetRuleRunnerEntry[];
}

/**
 * Explains the step the focused rule will take next, as one chain:
 * batch rows → predictions → per-row loss → per-row gradient → their mean
 * (exactly the batch gradient the rule reads as g<param>) → the rule's
 * update → the new parameters. It describes the PENDING step — the same
 * batch the data plot highlights — so pressing Step makes it happen.
 */
export function StepInspector({ entries }: Props) {
  useRunnersVersion(entries.map((e) => e.runner));
  const dataset = useWorkspaceStore((s) => s.dataset);
  const loss = useWorkspaceStore((s) => s.activePerExampleLoss);
  const primaryVariables = useWorkspaceStore((s) => s.primaryVariables);
  const focusedRuleId = useWorkspaceStore((s) => s.focusedRuleId);
  const setFocusedRuleId = useWorkspaceStore((s) => s.setFocusedRuleId);

  const focused = pickFocusedEntry(entries, focusedRuleId);
  const visible = entries.filter((e) => e.rule.visible);

  return (
    <CollapsiblePanel title="Step inspector" className="panel step-inspector">
      {!focused || !dataset || !loss ? (
        <p className="field-hint">Show at least one rule to inspect its next step.</p>
      ) : (
        <>
          <div className="sim-settings-row">
            <label className="field-label" htmlFor="inspector-rule-select">
              Rule
            </label>
            <select id="inspector-rule-select" value={focused.rule.id} onChange={(e) => setFocusedRuleId(e.target.value)}>
              {visible.map((e) => (
                <option key={e.rule.id} value={e.rule.id}>
                  {e.rule.name}
                </option>
              ))}
            </select>
            <span className="field-hint">iteration {focused.runner.current.iteration} → {focused.runner.current.iteration + 1}</span>
          </div>
          <BatchTable
            trace={traceBatch(loss, dataset, focused.runner.current.batchRowIndices, focused.runner.current.coords, primaryVariables)}
            primaryVariables={primaryVariables}
          />
          <UpdateSummary entry={focused} primaryVariables={primaryVariables} />
        </>
      )}
    </CollapsiblePanel>
  );
}

function BatchTable({ trace, primaryVariables }: { trace: BatchTrace; primaryVariables: readonly PrimaryVariable[] }) {
  const names = primaryVariables.map((v) => v.name);
  const hasPrediction = trace.rows.some((r) => r.prediction !== null);
  const hidden = trace.rows.length - MAX_ROWS_SHOWN;

  return (
    <div className="comparison-table-wrap">
      <table className="comparison-table inspector-table">
        <thead>
          <tr>
            <th>row</th>
            <th>x</th>
            <th>y</th>
            {hasPrediction ? <th>prediction</th> : null}
            <th>loss</th>
            {names.map((n) => (
              <th key={n}>∂loss/∂{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trace.rows.slice(0, MAX_ROWS_SHOWN).map((r, i) => (
            <tr key={i}>
              <td>{r.rowIndex + 1}</td>
              <td>{fmt(r.x)}</td>
              <td>{fmt(r.y)}</td>
              {hasPrediction ? <td>{fmt(r.prediction)}</td> : null}
              <td>{fmt(r.loss)}</td>
              {names.map((n) => (
                <td key={n}>{fmt(r.gradient[n])}</td>
              ))}
            </tr>
          ))}
          {hidden > 0 ? (
            <tr>
              <td colSpan={4 + names.length + (hasPrediction ? 1 : 0)} className="inspector-more">
                …{hidden} more rows (included in the means below)
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="inspector-mean-row">
            <td colSpan={hasPrediction ? 4 : 3}>mean of {trace.rows.length} rows</td>
            <td>{formatLoss(trace.meanLoss)}</td>
            {names.map((n) => (
              <td key={n}>
                g{n} = {fmt(trace.meanGradient[n])}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function UpdateSummary({ entry, primaryVariables }: { entry: DatasetRuleRunnerEntry; primaryVariables: readonly PrimaryVariable[] }) {
  const { rule, runner } = entry;
  const current = runner.current.coords;
  const peek = runner.peekUpdate();
  const blocked = rule.errors.length > 0 || runner.status === "error";

  return (
    <div className="inspector-update">
      <p className="field-hint">
        <strong style={{ color: rule.color }}>{rule.name}</strong> reads {primaryVariables.map((v) => `g${v.name}`).join(", ")} and updates:
      </p>
      {peek.ok ? (
        <ul className="inspector-update-list">
          {primaryVariables.map(({ name }) => (
            <li key={name}>
              {name}: {fmt(current[name])} → {fmt(peek.newCoords[name])} <span className="field-hint">({signed(peek.newCoords[name] - current[name])})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="error-message">Next step would fail: {peek.message}</p>
      )}
      <button type="button" className="secondary-button" disabled={blocked} onClick={() => runner.step()}>
        Step {rule.name}
      </button>
    </div>
  );
}
