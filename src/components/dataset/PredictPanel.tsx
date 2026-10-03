import { INPUT_NAME } from "../../domain/dataset/modelTemplates";
import { predictFromX } from "../../domain/visualization/modelCurve";
import { useRunnersVersion } from "../../hooks/useRunnersVersion";
import { useWorkspaceStore } from "../../state/workspaceStore";
import type { DatasetRuleRunnerEntry } from "../MetricCharts";
import { NumberInput } from "../NumberInput";

const PROBABILITY_THRESHOLD = 0.5;
const DIGITS = 4;

/**
 * "Use the model": type an input and see each visible rule's prediction
 * from its current parameters — and, for logistic regression, the class it
 * would choose. The input is also marked on the data plot.
 */
export function PredictPanel({ entries }: { entries: DatasetRuleRunnerEntry[] }) {
  useRunnersVersion(entries.map((e) => e.runner));
  const loss = useWorkspaceStore((s) => s.activePerExampleLoss);
  const definesPrediction = useWorkspaceStore((s) => s.modelDefinesPrediction);
  const modelKind = useWorkspaceStore((s) => s.modelKind);
  const inputColumn = useWorkspaceStore((s) => s.inputColumn);
  const targetColumn = useWorkspaceStore((s) => s.targetColumn);
  const predictInput = useWorkspaceStore((s) => s.predictInput);
  const setPredictInput = useWorkspaceStore((s) => s.setPredictInput);

  if (!loss || !definesPrediction) return null;
  const visible = entries.filter((e) => e.rule.visible);

  return (
    <div className="predict-panel">
      <h2>Predict</h2>
      <div className="sim-settings-row">
        <label className="field-label" htmlFor="predict-input">
          {inputColumn ?? INPUT_NAME} =
        </label>
        <NumberInput id="predict-input" value={predictInput ?? ""} placeholder="type a value" onValue={setPredictInput} />
        {predictInput !== null ? (
          <button type="button" className="secondary-button" onClick={() => setPredictInput(null)}>
            Clear
          </button>
        ) : null}
      </div>
      {predictInput !== null ? (
        <ul className="predict-results">
          {visible.map(({ rule, runner }) => {
            const prediction = predictFromX(loss, runner.current.coords, predictInput);
            return (
              <li key={rule.id}>
                <span className="color-dot" style={{ background: rule.color }} /> {rule.name}:{" "}
                {prediction === null ? (
                  "can't predict from x alone"
                ) : modelKind === "logistic" ? (
                  <>
                    P({targetColumn} = 1) = {prediction.toFixed(DIGITS)} → predicts <strong>{prediction >= PROBABILITY_THRESHOLD ? 1 : 0}</strong>
                  </>
                ) : (
                  <>
                    {targetColumn} ≈ <strong>{prediction.toFixed(DIGITS)}</strong>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
