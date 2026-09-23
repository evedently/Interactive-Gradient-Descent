import { describe, expect, it } from "vitest";
import { parseExpression } from "../../../../src/domain/expr/parser";
import { evaluateExpr } from "../../../../src/domain/expr/evaluate";
import { ExprError } from "../../../../src/domain/expr/errors";

describe("evaluateExpr: identifier resolution", () => {
  it("throws ExprError for an identifier missing from scope", () => {
    const ast = parseExpression("x + z");
    expect(() => evaluateExpr(ast, { x: 1 })).toThrow(ExprError);
  });
});

describe("evaluateExpr: IEEE-754 domain semantics (not thrown as errors)", () => {
  it("sqrt of a negative number is NaN, not a thrown error", () => {
    const ast = parseExpression("sqrt(x)");
    const result = evaluateExpr(ast, { x: -4 });
    expect(Number.isNaN(result)).toBe(true);
  });

  it("division by zero is Infinity, not a thrown error", () => {
    const ast = parseExpression("1 / x");
    expect(evaluateExpr(ast, { x: 0 })).toBe(Infinity);
    expect(evaluateExpr(ast, { x: -0 })).toBe(-Infinity);
  });
});
