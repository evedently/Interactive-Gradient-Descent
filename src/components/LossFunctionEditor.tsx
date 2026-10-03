import katex from "katex";
import { useMemo } from "react";
import { exprToLatex } from "../domain/expr/toLatex";
import { computeLossGradient } from "../domain/lossFunction";
import { offsetToLineColumn } from "../domain/rules/ruleTypes";
import { useWorkspaceStore } from "../state/workspaceStore";
import { CollapsiblePanel } from "./CollapsiblePanel";

function renderMathLine(latex: string): string {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode: false });
  } catch {
    return "";
  }
}

/**
 * The loss function is shared by every rule (DESIGN.md §1/§9), so this
 * component has no dependency on any particular rule's runner. Phase 5
 * adds: a symbolic gradient formula when the loss is fully smooth, the two
 * differentiability warning badges, and a manual gradient override — none
 * of them block editing or running (DESIGN.md §5).
 */
export function LossFunctionEditor() {
  const lossSourceText = useWorkspaceStore((s) => s.lossSourceText);
  const lossParse = useWorkspaceStore((s) => s.lossParse);
  const activeLoss = useWorkspaceStore((s) => s.activeLoss);
  const startPoint = useWorkspaceStore((s) => s.startPoint);
  const setLossSourceText = useWorkspaceStore((s) => s.setLossSourceText);

  const manualGradientEnabled = useWorkspaceStore((s) => s.manualGradientEnabled);
  const manualGradientGxSource = useWorkspaceStore((s) => s.manualGradientGxSource);
  const manualGradientGySource = useWorkspaceStore((s) => s.manualGradientGySource);
  const manualGradientGxError = useWorkspaceStore((s) => s.manualGradientGxError);
  const manualGradientGyError = useWorkspaceStore((s) => s.manualGradientGyError);
  const setManualGradientEnabled = useWorkspaceStore((s) => s.setManualGradientEnabled);
  const setManualGradientGx = useWorkspaceStore((s) => s.setManualGradientGx);
  const setManualGradientGy = useWorkspaceStore((s) => s.setManualGradientGy);

  const previewLatex = useMemo(() => {
    try {
      return katex.renderToString(exprToLatex(activeLoss.ast), { throwOnError: false, displayMode: true });
    } catch {
      return "";
    }
  }, [activeLoss.ast]);

  const gradientAtStart = useMemo(() => computeLossGradient(activeLoss, startPoint.x, startPoint.y), [activeLoss, startPoint]);

  const error = !lossParse.ok ? lossParse.error : null;
  const errorLocation = error ? offsetToLineColumn(lossSourceText, error.span.start) : null;

  const gxFormulaHtml = activeLoss.symbolicGradient ? renderMathLine(`\\text{gx} = ${exprToLatex(activeLoss.symbolicGradient.gx)}`) : null;
  const gyFormulaHtml = activeLoss.symbolicGradient ? renderMathLine(`\\text{gy} = ${exprToLatex(activeLoss.symbolicGradient.gy)}`) : null;

  return (
    <CollapsiblePanel title="Loss function">
      <label className="field-label" htmlFor="loss-input">
        f(x, y) =
      </label>
      <input
        id="loss-input"
        className={`loss-input ${error ? "has-error" : ""}`}
        type="text"
        value={lossSourceText}
        onChange={(e) => setLossSourceText(e.target.value)}
        spellCheck={false}
        autoComplete="off"
      />
      {error ? (
        <p className="error-message">
          Column {errorLocation!.column}: {error.message}
        </p>
      ) : null}

      <div className="katex-preview" dangerouslySetInnerHTML={{ __html: previewLatex }} />

      {activeLoss.mayBeNondifferentiable || activeLoss.mayBeUndefinedForSomeInputs ? (
        <div className="differentiability-warnings">
          {activeLoss.mayBeNondifferentiable ? <span className="warning-badge">This function may be nondifferentiable.</span> : null}
          {activeLoss.mayBeUndefinedForSomeInputs ? (
            <span className="warning-badge">This function may be undefined for some inputs.</span>
          ) : null}
        </div>
      ) : null}

      <div className="gradient-display">
        <div className="gradient-method">
          Differentiation:{" "}
          {manualGradientEnabled && activeLoss.manualGradient
            ? "manual override"
            : activeLoss.symbolicGradient
              ? "symbolic"
              : "numerical (central difference)"}
        </div>
        {!manualGradientEnabled && activeLoss.symbolicGradient ? (
          <>
            <div className="gradient-formula" dangerouslySetInnerHTML={{ __html: gxFormulaHtml! }} />
            <div className="gradient-formula" dangerouslySetInnerHTML={{ __html: gyFormulaHtml! }} />
          </>
        ) : !manualGradientEnabled ? (
          <div className="gradient-values">
            At start point: gx = {gradientAtStart.gx.toFixed(4)} &nbsp; gy = {gradientAtStart.gy.toFixed(4)}
          </div>
        ) : null}
      </div>

      <div className="manual-gradient-override">
        <label className="manual-gradient-toggle">
          <input type="checkbox" checked={manualGradientEnabled} onChange={(e) => setManualGradientEnabled(e.target.checked)} />
          Override gradient manually
        </label>
        {manualGradientEnabled ? (
          <div className="manual-gradient-fields">
            <div className="manual-gradient-field">
              <label className="field-label" htmlFor="manual-gx">
                gx =
              </label>
              <input
                id="manual-gx"
                className={`loss-input ${manualGradientGxError ? "has-error" : ""}`}
                type="text"
                value={manualGradientGxSource}
                onChange={(e) => setManualGradientGx(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              {manualGradientGxError ? <p className="error-message">{manualGradientGxError.message}</p> : null}
            </div>
            <div className="manual-gradient-field">
              <label className="field-label" htmlFor="manual-gy">
                gy =
              </label>
              <input
                id="manual-gy"
                className={`loss-input ${manualGradientGyError ? "has-error" : ""}`}
                type="text"
                value={manualGradientGySource}
                onChange={(e) => setManualGradientGy(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              {manualGradientGyError ? <p className="error-message">{manualGradientGyError.message}</p> : null}
            </div>
            {!activeLoss.manualGradient ? (
              <p className="field-hint">Enter valid expressions for both gx and gy (using x, y) to activate the override.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </CollapsiblePanel>
  );
}
