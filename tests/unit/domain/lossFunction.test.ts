import { describe, expect, it } from "vitest";
import {
  computeLossGradient,
  evaluateLoss,
  lossNumericGradient,
  parseLossFunction,
  parseManualGradientComponent,
  toResolvedLoss,
  type ResolvedLoss,
} from "../../../src/domain/lossFunction";

describe("parseLossFunction", () => {
  it("accepts a valid expression using only x and y", () => {
    const result = parseLossFunction("(x - 3)^2 + 4*(y + 1)^2");
    expect(result.ok).toBe(true);
  });

  it("rejects an identifier other than x or y", () => {
    const result = parseLossFunction("x + z");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/Unknown identifier 'z'/);
    }
  });

  it("surfaces a syntax error with its span", () => {
    const result = parseLossFunction("(x + 1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.span).toBeDefined();
    }
  });
});

describe("evaluateLoss / lossNumericGradient", () => {
  it("evaluates the loss and its numeric gradient at a point", () => {
    const parsed = parseLossFunction("(x - 3)^2 + 4*(y + 1)^2");
    if (!parsed.ok) throw new Error("fixture should parse");
    expect(evaluateLoss(parsed.ast, 3, -1)).toBeCloseTo(0, 9);
    const { gx, gy } = lossNumericGradient(parsed.ast, 0, 0);
    expect(gx).toBeCloseTo(-6, 5);
    expect(gy).toBeCloseTo(8, 5);
  });
});

describe("parseLossFunction: Phase 5 differentiation resolution", () => {
  it("produces a symbolic gradient and no warnings for a smooth polynomial", () => {
    const parsed = parseLossFunction("(x - 3)^2 + 4*(y + 1)^2");
    if (!parsed.ok) throw new Error("fixture should parse");
    expect(parsed.symbolicGradient).not.toBeNull();
    expect(parsed.mayBeNondifferentiable).toBe(false);
    expect(parsed.mayBeUndefinedForSomeInputs).toBe(false);
  });

  it("produces no symbolic gradient (null) and the nondifferentiable warning for a loss containing abs", () => {
    const parsed = parseLossFunction("abs(x - 3) + (y + 1)^2");
    if (!parsed.ok) throw new Error("fixture should parse");
    expect(parsed.symbolicGradient).toBeNull();
    expect(parsed.mayBeNondifferentiable).toBe(true);
  });

  it("flags the domain-risk warning for an unguarded sqrt/log/tan/division without forbidding symbolic differentiation", () => {
    const parsed = parseLossFunction("sqrt(x) + (y)^2");
    if (!parsed.ok) throw new Error("fixture should parse");
    expect(parsed.mayBeUndefinedForSomeInputs).toBe(true);
    expect(parsed.symbolicGradient).not.toBeNull(); // sqrt is smooth, just domain-restricted
  });
});

describe("computeLossGradient: method precedence (manual > symbolic > numeric)", () => {
  function resolvedLossFor(source: string): ResolvedLoss {
    const parsed = parseLossFunction(source);
    if (!parsed.ok) throw new Error("fixture should parse");
    return toResolvedLoss(parsed);
  }

  it("uses symbolic when available and matches numeric within tolerance", () => {
    const loss = resolvedLossFor("(x - 3)^2 + 4*(y + 1)^2");
    const result = computeLossGradient(loss, 0, 0);
    expect(result.method).toBe("symbolic");
    expect(result.gx).toBeCloseTo(-6, 9);
    expect(result.gy).toBeCloseTo(8, 9);
  });

  it("falls back to numeric for a loss containing abs", () => {
    const loss = resolvedLossFor("abs(x - 3) + (y + 1)^2");
    const result = computeLossGradient(loss, 0, 0);
    expect(result.method).toBe("numeric");
    expect(result.gx).toBeCloseTo(-1, 4); // d/dx abs(x-3) at x=0 is -1 (x-3<0)
    expect(result.gy).toBeCloseTo(2, 4);
  });

  it("manual override wins even when a symbolic gradient is available", () => {
    const loss = resolvedLossFor("(x - 3)^2 + 4*(y + 1)^2");
    const gx = parseManualGradientComponent("1");
    const gy = parseManualGradientComponent("2");
    if (!gx.ok || !gy.ok) throw new Error("fixture manual gradient should parse");
    loss.manualGradient = { gx: gx.ast, gy: gy.ast };
    const result = computeLossGradient(loss, 0, 0);
    expect(result.method).toBe("manual");
    expect(result.gx).toBe(1);
    expect(result.gy).toBe(2);
  });
});

describe("parseManualGradientComponent", () => {
  it("accepts an expression over x and y", () => {
    const result = parseManualGradientComponent("2*(x - 3)");
    expect(result.ok).toBe(true);
  });

  it("rejects an identifier other than x or y", () => {
    const result = parseManualGradientComponent("z + 1");
    expect(result.ok).toBe(false);
  });
});
