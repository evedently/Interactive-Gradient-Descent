import type { DatasetRunTargetKind } from "../../state/workspaceStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { isPositive, NumberInput } from "../NumberInput";

const MAX_BATCH_SIZE = 10_000;

/** Step 3 of dataset mode: where training starts, how many rows each step learns from, and when to stop. */
export function TrainingSection() {
  const primaryVariables = useWorkspaceStore((s) => s.primaryVariables);
  const datasetInitialValues = useWorkspaceStore((s) => s.datasetInitialValues);
  const setDatasetInitialValue = useWorkspaceStore((s) => s.setDatasetInitialValue);
  const batchSize = useWorkspaceStore((s) => s.batchSize);
  const setBatchSize = useWorkspaceStore((s) => s.setBatchSize);
  const datasetRunTargetKind = useWorkspaceStore((s) => s.datasetRunTargetKind);
  const datasetRunTargetValue = useWorkspaceStore((s) => s.datasetRunTargetValue);
  const setDatasetRunTarget = useWorkspaceStore((s) => s.setDatasetRunTarget);

  return (
    <div className="dataset-section">
      <h3 className="dataset-section-title">3. Training</h3>
      <label className="field-label">Initial values</label>
      <div className="dataset-initial-values-row">
        {primaryVariables.map((v) => (
          <label key={v.name} className="dataset-initial-value-field">
            {v.name} =
            <NumberInput value={datasetInitialValues[v.name] ?? 0} onValue={(value) => setDatasetInitialValue(v.name, value)} />
          </label>
        ))}
      </div>

      <div className="sim-settings-row">
        <label className="field-label" htmlFor="batch-size-input">
          Batch size
        </label>
        <NumberInput
          id="batch-size-input"
          type="number"
          min={1}
          max={MAX_BATCH_SIZE}
          value={batchSize}
          onValue={(value) => setBatchSize(Math.min(MAX_BATCH_SIZE, value))}
        />
        <span className="field-hint">rows per step</span>
      </div>

      <div className="sim-settings-row">
        <label className="field-label" htmlFor="run-target-kind">
          Run mode
        </label>
        <select
          id="run-target-kind"
          value={datasetRunTargetKind}
          onChange={(e) => setDatasetRunTarget(e.target.value as DatasetRunTargetKind, datasetRunTargetValue)}
        >
          <option value="continuous">Continuous</option>
          <option value="epochs">N epochs</option>
          <option value="seconds">N seconds</option>
        </select>
        {datasetRunTargetKind !== "continuous" ? (
          <NumberInput
            type="number"
            min={1}
            value={datasetRunTargetValue}
            isValid={isPositive}
            onValue={(value) => setDatasetRunTarget(datasetRunTargetKind, value)}
          />
        ) : null}
      </div>
    </div>
  );
}
