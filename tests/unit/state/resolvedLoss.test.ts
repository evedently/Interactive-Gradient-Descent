import { describe, expect, it } from "vitest";
import { parseLossFunction, parseManualGradientComponent } from "../../../src/domain/lossFunction";
import { baseLossFrom, recomputeActiveLoss } from "../../../src/state/resolvedLoss";

function parsed(text: string) {
  const result = parseLossFunction(text);
  if (!result.ok) throw new Error(`test loss failed to parse: ${text}`);
  return result;
}

function manual(text: string) {
  const result = parseManualGradientComponent(text);
  if (!result.ok) throw new Error(`test gradient failed to parse: ${text}`);
  return result.ast;
}

describe("baseLossFrom", () => {
  it("baseLossFrom_smoothLoss_copiesParseFieldsWithNoManualGradient", () => {
    const p = parsed("x^2 + y^2");
    const loss = baseLossFrom(p);
    expect(loss.ast).toBe(p.ast);
    expect(loss.symbolicGradient).toBe(p.symbolicGradient);
    expect(loss.mayBeNondifferentiable).toBe(false);
    expect(loss.manualGradient).toBeNull();
  });
});

describe("recomputeActiveLoss", () => {
  const base = baseLossFrom(parsed("x^2 + y^2"));
  const gx = manual("2*x");
  const gy = manual("2*y");

  it("recomputeActiveLoss_enabledWithBothComponents_setsManualGradient", () => {
    expect(recomputeActiveLoss(base, true, gx, gy).manualGradient).toEqual({ gx, gy });
  });

  it("recomputeActiveLoss_disabled_clearsManualGradient", () => {
    expect(recomputeActiveLoss(base, false, gx, gy).manualGradient).toBeNull();
  });

  it("recomputeActiveLoss_missingComponent_clearsManualGradient", () => {
    expect(recomputeActiveLoss(base, true, gx, null).manualGradient).toBeNull();
  });

  it("recomputeActiveLoss_keepsBaseLossFields", () => {
    expect(recomputeActiveLoss(base, true, gx, gy).ast).toBe(base.ast);
  });
});
