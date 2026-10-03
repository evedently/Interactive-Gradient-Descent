import { SAMPLE_DATASETS } from "../../samples";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { CollapsiblePanel } from "../CollapsiblePanel";

const NO_SAMPLE = "";

/** Step 1 of dataset mode: pick a built-in sample or upload a CSV, then choose which columns are the input (x) and target (y). */
export function DataSourceSection() {
  const sourceDataset = useWorkspaceStore((s) => s.sourceDataset);
  const datasetFileName = useWorkspaceStore((s) => s.datasetFileName);
  const datasetError = useWorkspaceStore((s) => s.datasetError);
  const datasetWarning = useWorkspaceStore((s) => s.datasetWarning);
  const inputColumn = useWorkspaceStore((s) => s.inputColumn);
  const targetColumn = useWorkspaceStore((s) => s.targetColumn);
  const loadDatasetFromFile = useWorkspaceStore((s) => s.loadDatasetFromFile);
  const loadDatasetFromText = useWorkspaceStore((s) => s.loadDatasetFromText);
  const setColumnMapping = useWorkspaceStore((s) => s.setColumnMapping);

  const loadedSample = SAMPLE_DATASETS.find((s) => s.fileName === datasetFileName);

  const loadSample = (id: string) => {
    const sample = SAMPLE_DATASETS.find((s) => s.id === id);
    if (!sample) return;
    loadDatasetFromText(sample.csvText, sample.fileName, {
      modelKind: sample.modelKind,
      inputColumn: sample.inputColumn,
      targetColumn: sample.targetColumn,
    });
  };

  return (
    <CollapsiblePanel title="1. Data" className="dataset-section">
      <div className="sim-settings-row">
        <label className="field-label" htmlFor="sample-dataset-select">
          Sample
        </label>
        <select id="sample-dataset-select" value={loadedSample?.id ?? NO_SAMPLE} onChange={(e) => loadSample(e.target.value)}>
          <option value={NO_SAMPLE}>— choose a sample —</option>
          {SAMPLE_DATASETS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {loadedSample ? <p className="field-hint">{loadedSample.description}</p> : null}

      <label className="field-label" htmlFor="dataset-csv-input">
        …or upload a CSV
      </label>
      <input
        id="dataset-csv-input"
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void loadDatasetFromFile(file);
        }}
      />
      {datasetFileName && !loadedSample ? <p className="field-hint">Loaded: {datasetFileName}</p> : null}
      {datasetWarning ? <p className="warning-badge">{datasetWarning}</p> : null}
      {datasetError ? <p className="error-message">{datasetError}</p> : null}

      {sourceDataset ? (
        <>
          <p className="field-hint">{sourceDataset.rows.length} rows</p>
          <ColumnPicker
            label="Input (x)"
            id="input-column-select"
            columns={sourceDataset.columns}
            value={inputColumn}
            onChange={(column) => setColumnMapping(column, targetColumn ?? "")}
          />
          <ColumnPicker
            label="Target (y)"
            id="target-column-select"
            columns={sourceDataset.columns}
            value={targetColumn}
            onChange={(column) => setColumnMapping(inputColumn ?? "", column)}
          />
        </>
      ) : null}
    </CollapsiblePanel>
  );
}

interface ColumnPickerProps {
  label: string;
  id: string;
  columns: readonly string[];
  value: string | null;
  onChange: (column: string) => void;
}

function ColumnPicker({ label, id, columns, value, onChange }: ColumnPickerProps) {
  return (
    <div className="sim-settings-row">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {columns.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
