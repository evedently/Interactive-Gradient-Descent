import { describe, expect, it } from "vitest";
import { evaluatePerExampleLossForRow, evaluatePrediction } from "../../../../src/domain/dataset/evaluatePerExampleLoss";
import { MODEL_TEMPLATES, TEMPLATE_PARAMETER_NAMES } from "../../../../src/domain/dataset/modelTemplates";
import { compilePerExampleLoss } from "../../../../src/domain/dataset/perExampleLoss";
import { rowLossGradient } from "../../../../src/domain/dataset/DatasetGradientSource";

const PARAMS = TEMPLATE_PARAMETER_NAMES.map((name) => ({ name }));

function compileTemplate(kind: "linear" | "logistic") {
  const { compiled, errors } = compilePerExampleLoss(MODEL_TEMPLATES[kind].sourceText, PARAMS, ["x", "y"]);
  expect(errors).toEqual([]);
  return compiled!;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

describe("linear template", () => {
  const loss = compileTemplate("linear");
  const coords = { w: 1.5, b: -0.5 };
  const row = { x: 2, y: 3 };

  it("linearTemplate_prediction_isWxPlusB", () => {
    expect(evaluatePrediction(loss, coords, row)).toBeCloseTo(2.5);
  });

  it("linearTemplate_loss_isSquaredError", () => {
    expect(evaluatePerExampleLossForRow(loss, coords, row)).toBeCloseTo(0.25);
  });

  it("linearTemplate_numericGradient_matchesAnalytic", () => {
    const residual = 1.5 * 2 - 0.5 - 3;
    const g = rowLossGradient(loss, row, coords, PARAMS);
    expect(g.w).toBeCloseTo(2 * residual * 2, 5);
    expect(g.b).toBeCloseTo(2 * residual, 5);
  });
});

describe("logistic template", () => {
  const loss = compileTemplate("logistic");
  const coords = { w: 0.8, b: -1.2 };

  it("logisticTemplate_prediction_isSigmoidProbability", () => {
    expect(evaluatePrediction(loss, coords, { x: 3, y: 1 })).toBeCloseTo(sigmoid(0.8 * 3 - 1.2));
  });

  it("logisticTemplate_loss_isCrossEntropy", () => {
    const p = sigmoid(0.8 * 3 - 1.2);
    expect(evaluatePerExampleLossForRow(loss, coords, { x: 3, y: 1 })).toBeCloseTo(-Math.log(p));
    expect(evaluatePerExampleLossForRow(loss, coords, { x: 3, y: 0 })).toBeCloseTo(-Math.log(1 - p));
  });

  it("logisticTemplate_numericGradient_matchesAnalytic", () => {
    const row = { x: 3, y: 1 };
    const err = sigmoid(0.8 * 3 - 1.2) - 1;
    const g = rowLossGradient(loss, row, coords, PARAMS);
    expect(g.w).toBeCloseTo(err * 3, 5);
    expect(g.b).toBeCloseTo(err, 5);
  });

  it("logisticTemplate_extremeLogits_stayFinite", () => {
    expect(Number.isFinite(evaluatePerExampleLossForRow(loss, { w: 1000, b: 0 }, { x: 5, y: 0 }))).toBe(true);
    expect(Number.isFinite(evaluatePerExampleLossForRow(loss, { w: -1000, b: 0 }, { x: 5, y: 1 }))).toBe(true);
  });

  it("logisticTemplate_validateTargets_rejectsNonBinary", () => {
    expect(MODEL_TEMPLATES.logistic.validateTargets([0, 1, 1, 0])).toBeNull();
    expect(MODEL_TEMPLATES.logistic.validateTargets([0, 0.5, 1])).toMatch(/0 or 1/);
  });

  it("linearTemplate_validateTargets_acceptsAnyNumber", () => {
    expect(MODEL_TEMPLATES.linear.validateTargets([-3.2, 0.5, 100])).toBeNull();
  });
});
