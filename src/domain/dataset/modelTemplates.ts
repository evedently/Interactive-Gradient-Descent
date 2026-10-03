/** The built-in models are templates (preset formula text); `custom` is the presenter's own formula. */
export type ModelKind = "linear" | "logistic" | "custom";
export type TemplateKind = Exclude<ModelKind, "custom">;

/** Every template's two trainable parameters: weight and bias. */
export const TEMPLATE_PARAMETER_NAMES: [string, string] = ["w", "b"];

/** The names the chosen input and target columns take in every model formula. */
export const INPUT_NAME = "x";
export const TARGET_NAME = "y";

/**
 * A formula that assigns this name exposes the model's output, which is what
 * the data plot draws and Predict evaluates. Optional for custom formulas.
 */
export const PREDICTION_NAME = "prediction";

export interface ModelTemplate {
  kind: TemplateKind;
  label: string;
  description: string;
  sourceText: string;
  /** Returns a presenter-facing reason the target column can't be used with this model, or `null` if it can. */
  validateTargets: (targets: readonly number[]) => string | null;
}

const acceptAnyTarget = () => null;

function requireBinaryTargets(targets: readonly number[]): string | null {
  const bad = targets.find((t) => t !== 0 && t !== 1);
  return bad === undefined ? null : `Logistic regression needs a target column of only 0 or 1 (found ${bad})`;
}

export const MODEL_TEMPLATES: Record<TemplateKind, ModelTemplate> = {
  linear: {
    kind: "linear",
    label: "Linear regression",
    description: "Fit a straight line; squared-error loss.",
    sourceText: ["prediction = w * x + b", "error = prediction - y", "loss = error^2"].join("\n"),
    validateTargets: acceptAnyTarget,
  },
  logistic: {
    kind: "logistic",
    label: "Logistic regression",
    description: "Predict the probability of class 1; cross-entropy loss.",
    // `loss` is cross-entropy rewritten as max(z,0) + ln(1 + e^-|z|) - y*z,
    // which equals -[y ln p + (1-y) ln(1-p)] but never overflows `exp` for
    // large |z| (a diverging run would otherwise turn loss into NaN).
    sourceText: ["z = w * x + b", "prediction = 1 / (1 + exp(-z))", "loss = max(z, 0) + ln(1 + exp(-abs(z))) - y * z"].join("\n"),
    validateTargets: requireBinaryTargets,
  },
};

export function isTemplateKind(kind: ModelKind): kind is TemplateKind {
  return kind !== "custom";
}
