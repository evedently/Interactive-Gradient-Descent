import { describe, expect, it } from "vitest";
import { parseExpression } from "../../../../src/domain/expr/parser";
import { analyzeDifferentiability, isFullySmooth } from "../../../../src/domain/expr/differentiability";

function analyze(source: string) {
  return analyzeDifferentiability(parseExpression(source));
}

describe("analyzeDifferentiability: 'may be nondifferentiable'", () => {
  it("flags abs, min, max anywhere in the tree", () => {
    expect(analyze("abs(x)").mayBeNondifferentiable).toBe(true);
    expect(analyze("min(x, y)").mayBeNondifferentiable).toBe(true);
    expect(analyze("max(x, y) + 1").mayBeNondifferentiable).toBe(true);
  });

  it("does not flag a fully smooth expression", () => {
    expect(analyze("(x - 3)^2 + sin(y)").mayBeNondifferentiable).toBe(false);
  });
});

describe("analyzeDifferentiability: 'may be undefined for some inputs'", () => {
  it("flags sqrt/ln/log/tan of a non-constant argument", () => {
    expect(analyze("sqrt(x)").mayBeUndefinedForSomeInputs).toBe(true);
    expect(analyze("ln(x)").mayBeUndefinedForSomeInputs).toBe(true);
    expect(analyze("log(x, 2)").mayBeUndefinedForSomeInputs).toBe(true);
    expect(analyze("tan(x)").mayBeUndefinedForSomeInputs).toBe(true);
  });

  it("does not flag sqrt/ln of a literal positive constant", () => {
    expect(analyze("sqrt(4)").mayBeUndefinedForSomeInputs).toBe(false);
    expect(analyze("ln(2)").mayBeUndefinedForSomeInputs).toBe(false);
  });

  it("always flags tan, even with a constant argument (asymptote risk isn't a sign check)", () => {
    expect(analyze("tan(1)").mayBeUndefinedForSomeInputs).toBe(true);
  });

  it("flags division unless the denominator is a literal nonzero constant", () => {
    expect(analyze("x / y").mayBeUndefinedForSomeInputs).toBe(true);
    expect(analyze("x / (y - 1)").mayBeUndefinedForSomeInputs).toBe(true);
    expect(analyze("x / 2").mayBeUndefinedForSomeInputs).toBe(false);
    expect(analyze("x / 0").mayBeUndefinedForSomeInputs).toBe(true); // literal but zero — still risky
  });

  it("is conservative: a provably-safe non-literal argument is still flagged", () => {
    // x^2 + 1 is always positive, but this check does no such reasoning.
    expect(analyze("sqrt(x^2 + 1)").mayBeUndefinedForSomeInputs).toBe(true);
  });

  it("the two warnings are independent", () => {
    const result = analyze("abs(x) + 1 / y");
    expect(result.mayBeNondifferentiable).toBe(true);
    expect(result.mayBeUndefinedForSomeInputs).toBe(true);
  });

  it("neither warning applies to a clean polynomial", () => {
    const result = analyze("(x - 3)^2 + 4*(y + 1)^2");
    expect(result.mayBeNondifferentiable).toBe(false);
    expect(result.mayBeUndefinedForSomeInputs).toBe(false);
  });
});

describe("isFullySmooth", () => {
  it("is true for expressions without abs/min/max", () => {
    expect(isFullySmooth(parseExpression("sqrt(x) + sin(y) / 2"))).toBe(true);
  });

  it("is false as soon as abs/min/max appears anywhere, however deeply nested", () => {
    expect(isFullySmooth(parseExpression("sin(abs(x)) + y"))).toBe(false);
    expect(isFullySmooth(parseExpression("min(x, y)"))).toBe(false);
  });
});
