import { useRef } from "react";
import { offsetToLineColumn } from "../domain/rules/ruleTypes";
import type { DatasetRunTargetKind } from "../state/workspaceStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { CollapsiblePanel } from "./CollapsiblePanel";
import { isPositive, NumberInput } from "./NumberInput";

const MAX_BATCH_SIZE = 10_000;

/**
 * Dataset mode's left-panel controls (DESIGN.md §13/§18 Phase 7): CSV
 * upload with the size warning/refusal from §16, the two model-parameter
 * names, the per-example loss editor (reusing the rule grammar minus
 * parameter/state declarations, §7), numeric-only initial values (no
 * draggable start point), and the batch-size/run-mode settings. Hidden
 * entirely in surface mode (§7's "dataset UI ... stays hidden when the
 * mode is off").
 */
export function DatasetPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const primaryVariables = useWorkspaceStore((s) => s.primaryVariables);
  const datasetPrimaryVariableNames = useWorkspaceStore((s) => s.datasetPrimaryVariableNames);
  const setDatasetPrimaryVariableNames = useWorkspaceStore((s) => s.setDatasetPrimaryVariableNames);

  const dataset = useWorkspaceStore((s) => s.dataset);
  const datasetFileName = useWorkspaceStore((s) => s.datasetFileName);
  const datasetError = useWorkspaceStore((s) => s.datasetError);
  const datasetWarning = useWorkspaceStore((s) => s.datasetWarning);
  const loadDatasetFromFile = useWorkspaceStore((s) => s.loadDatasetFromFile);

  const perExampleLossSourceText = useWorkspaceStore((s) => s.perExampleLossSourceText);
  const perExampleLossErrors = useWorkspaceStore((s) => s.perExampleLossErrors);
  const setPerExampleLossSourceText = useWorkspaceStore((s) => s.setPerExampleLossSourceText);

  const datasetInitialValues = useWorkspaceStore((s) => s.datasetInitialValues);
  const setDatasetInitialValue = useWorkspaceStore((s) => s.setDatasetInitialValue);

  const batchSize = useWorkspaceStore((s) => s.batchSize);
  const setBatchSize = useWorkspaceStore((s) => s.setBatchSize);
  const datasetRunTargetKind = useWorkspaceStore((s) => s.datasetRunTargetKind);
  const datasetRunTargetValue = useWorkspaceStore((s) => s.datasetRunTargetValue);
  const setDatasetRunTarget = useWorkspaceStore((s) => s.setDatasetRunTarget);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadDatasetFromFile(file);
  };

  return (
    <CollapsiblePanel title="Dataset">

      <label className="field-label" htmlFor="dataset-csv-input">
        CSV file
      </label>
      <input
        id="dataset-csv-input"
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
      />
      {datasetFileName ? <p className="field-hint">Loaded: {datasetFileName}</p> : null}
      {datasetWarning ? <p className="warning-badge">{datasetWarning}</p> : null}
      {datasetError ? <p className="error-message">{datasetError}</p> : null}
      {dataset ? <p className="field-hint">Columns: {dataset.columns.join(", ")} ({dataset.rows.length} rows)</p> : null}

      <div className="primary-variable-names-row">
        <label className="field-label" htmlFor="primary-var-0">
          Model parameters
        </label>
        <input
          id="primary-var-0"
          className="parameter-number-input"
          type="text"
          value={datasetPrimaryVariableNames[0]}
          onChange={(e) => setDatasetPrimaryVariableNames([e.target.value, datasetPrimaryVariableNames[1]])}
        />
        <input
          className="parameter-number-input"
          type="text"
          value={datasetPrimaryVariableNames[1]}
          onChange={(e) => setDatasetPrimaryVariableNames([datasetPrimaryVariableNames[0], e.target.value])}
        />
      </div>

      <label className="field-label" htmlFor="per-example-loss-input">
        Per-example loss
      </label>
      <textarea
        id="per-example-loss-input"
        className={`loss-input rule-editor-textarea ${perExampleLossErrors.length > 0 ? "has-error" : ""}`}
        value={perExampleLossSourceText}
        onChange={(e) => setPerExampleLossSourceText(e.target.value)}
        spellCheck={false}
        rows={4}
      />
      {perExampleLossErrors.length > 0 ? (
        <ul className="error-list">
          {perExampleLossErrors.map((err, i) => {
            const loc = offsetToLineColumn(perExampleLossSourceText, err.span.start);
            return (
              <li key={i} className="error-message">
                Line {loc.line}, Col {loc.column}: {err.message}
              </li>
            );
          })}
        </ul>
      ) : null}
      {!dataset ? <p className="field-hint">Load a CSV above to validate the per-example loss against its columns.</p> : null}

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
    </CollapsiblePanel>
  );
}
