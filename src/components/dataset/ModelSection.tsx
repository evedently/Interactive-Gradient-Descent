import { isTemplateKind, MODEL_TEMPLATES, PREDICTION_NAME, type ModelKind } from "../../domain/dataset/modelTemplates";
import { offsetToLineColumn } from "../../domain/rules/ruleTypes";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { FormulaDisplay } from "./FormulaDisplay";

const MODEL_OPTIONS: { kind: ModelKind; label: string }[] = [
  { kind: "linear", label: MODEL_TEMPLATES.linear.label },
  { kind: "logistic", label: MODEL_TEMPLATES.logistic.label },
  { kind: "custom", label: "Custom formula" },
];

/** Step 2 of dataset mode: which model to train, and its formula — shown as maths for templates, editable for Custom. */
export function ModelSection() {
  const modelKind = useWorkspaceStore((s) => s.modelKind);
  const setModelKind = useWorkspaceStore((s) => s.setModelKind);
  const customizeTemplate = useWorkspaceStore((s) => s.customizeTemplate);
  const modelDataError = useWorkspaceStore((s) => s.modelDataError);
  const modelDefinesPrediction = useWorkspaceStore((s) => s.modelDefinesPrediction);
  const activePerExampleLoss = useWorkspaceStore((s) => s.activePerExampleLoss);

  return (
    <div className="dataset-section">
      <h3 className="dataset-section-title">2. Model</h3>
      <div className="model-kind-options" role="radiogroup" aria-label="Model">
        {MODEL_OPTIONS.map((option) => (
          <label key={option.kind} className="model-kind-option">
            <input type="radio" name="model-kind" checked={modelKind === option.kind} onChange={() => setModelKind(option.kind)} />
            {option.label}
          </label>
        ))}
      </div>

      {isTemplateKind(modelKind) ? (
        <>
          <p className="field-hint">{MODEL_TEMPLATES[modelKind].description}</p>
          <FormulaDisplay sourceText={MODEL_TEMPLATES[modelKind].sourceText} />
          <button type="button" className="secondary-button" onClick={customizeTemplate}>
            Customize this formula
          </button>
        </>
      ) : (
        <CustomFormulaEditor />
      )}

      {modelDataError ? <p className="error-message">{modelDataError}</p> : null}
      {activePerExampleLoss && !modelDefinesPrediction ? (
        <p className="warning-badge">Define `{PREDICTION_NAME} = …` to draw the model and use Predict. Training still works without it.</p>
      ) : null}
    </div>
  );
}

function CustomFormulaEditor() {
  const names = useWorkspaceStore((s) => s.datasetPrimaryVariableNames);
  const setNames = useWorkspaceStore((s) => s.setDatasetPrimaryVariableNames);
  const sourceText = useWorkspaceStore((s) => s.perExampleLossSourceText);
  const setSourceText = useWorkspaceStore((s) => s.setPerExampleLossSourceText);
  const errors = useWorkspaceStore((s) => s.perExampleLossErrors);

  return (
    <>
      <div className="primary-variable-names-row">
        <label className="field-label" htmlFor="primary-var-0">
          Parameters
        </label>
        <input id="primary-var-0" className="parameter-number-input" type="text" value={names[0]} onChange={(e) => setNames([e.target.value, names[1]])} />
        <input className="parameter-number-input" type="text" value={names[1]} onChange={(e) => setNames([names[0], e.target.value])} />
      </div>
      <label className="field-label" htmlFor="per-example-loss-input">
        Formula (per row; use x, y, other columns, and the parameters; end with loss = …)
      </label>
      <textarea
        id="per-example-loss-input"
        className={`loss-input rule-editor-textarea ${errors.length > 0 ? "has-error" : ""}`}
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        spellCheck={false}
        rows={4}
      />
      {errors.length > 0 ? (
        <ul className="error-list">
          {errors.map((err, i) => {
            const loc = offsetToLineColumn(sourceText, err.span.start);
            return (
              <li key={i} className="error-message">
                Line {loc.line}, Col {loc.column}: {err.message}
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}
