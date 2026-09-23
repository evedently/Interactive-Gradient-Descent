import { describe, expect, it } from "vitest";
import { ExprError } from "../../../../src/domain/expr/errors";
import { parseExpression } from "../../../../src/domain/expr/parser";
import { evaluateExpr } from "../../../../src/domain/expr/evaluate";

function evalAt(source: string, scope: Record<string, number>): number {
  return evaluateExpr(parseExpression(source), scope);
}

describe("parseExpression: arithmetic and precedence", () => {
  it("parses numbers", () => {
    expect(evalAt("3", {})).toBe(3);
    expect(evalAt("3.5", {})).toBe(3.5);
  });

  it("respects + - * / precedence", () => {
    expect(evalAt("2 + 3 * 4", {})).toBe(14);
    expect(evalAt("(2 + 3) * 4", {})).toBe(20);
    expect(evalAt("10 - 2 - 3", {})).toBe(5); // left-associative
    expect(evalAt("10 / 2 / 5", {})).toBe(1); // left-associative
  });

  it("handles unary minus with correct precedence relative to ^", () => {
    expect(evalAt("-2^2", {})).toBe(-4); // -(2^2), not (-2)^2
    expect(evalAt("(-2)^2", {})).toBe(4);
  });

  it("treats ^ as right-associative", () => {
    expect(evalAt("2^3^2", {})).toBe(512); // 2^(3^2) = 2^9, not (2^3)^2 = 64
  });

  it("evaluates identifiers from scope", () => {
    expect(evalAt("x - 3", { x: 10 })).toBe(7);
    expect(evalAt("(x - 3)^2 + 4*(y + 1)^2", { x: 3, y: -1 })).toBe(0);
    expect(evalAt("(x - 3)^2 + 4*(y + 1)^2", { x: 0, y: 0 })).toBe(9 + 4);
  });

  it("supports sqrt and abs", () => {
    expect(evalAt("sqrt(16)", {})).toBe(4);
    expect(evalAt("abs(-5)", {})).toBe(5);
    expect(evalAt("sqrt(x*x + y*y)", { x: 3, y: 4 })).toBe(5);
  });

  it("supports sin, cos, tan", () => {
    expect(evalAt("sin(0)", {})).toBe(0);
    expect(evalAt("cos(0)", {})).toBe(1);
    expect(evalAt("tan(0)", {})).toBe(0);
  });

  it("supports ln (unary natural log)", () => {
    expect(evalAt("ln(1)", {})).toBe(0);
    expect(evalAt("ln(10)", {})).toBeCloseTo(2.302585093, 8);
  });

  it("evaluates log(x, base) against a hand-computed value", () => {
    expect(evalAt("log(8, 2)", {})).toBeCloseTo(3, 9);
    expect(evalAt("log(100, 10)", {})).toBeCloseTo(2, 9);
  });
});

describe("parseExpression: implicit multiplication", () => {
  it("multiplies a number directly against a parenthesized expression", () => {
    expect(evalAt("4(y + 1)^2", { y: -1 })).toBe(0);
    expect(evalAt("4(y + 1)^2", { y: 1 })).toBe(16);
  });

  it("multiplies an identifier directly against a parenthesized expression", () => {
    expect(evalAt("x(y + 1)", { x: 3, y: 1 })).toBe(6);
  });

  it("multiplies two adjacent parenthesized expressions", () => {
    expect(evalAt("(x + 1)(y + 1)", { x: 1, y: 1 })).toBe(4);
  });

  it("does NOT implicitly multiply two adjacent bare numbers (treated as an error, not '2*3')", () => {
    expect(() => parseExpression("2 3")).toThrow(ExprError);
  });
});

describe("parseExpression: error reporting with spans", () => {
  it("reports an unexpected character with a span at that character", () => {
    try {
      parseExpression("3 & 4");
      throw new Error("expected parseExpression to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ExprError);
      const e = err as ExprError;
      expect(e.span).toEqual({ start: 2, end: 3 });
    }
  });

  it("reports a mismatched parenthesis", () => {
    expect(() => parseExpression("(x + 1")).toThrow(ExprError);
  });

  it("reports wrong function arity with a span covering the call", () => {
    try {
      parseExpression("sqrt(1, 2)");
      throw new Error("expected parseExpression to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ExprError);
      const e = err as ExprError;
      expect(e.message).toMatch(/expects 1 argument/);
      expect(e.span).toEqual({ start: 0, end: 10 });
    }
  });

  it("reports trailing unexpected input", () => {
    expect(() => parseExpression("1 + 2)")).toThrow(ExprError);
  });

  it("rejects a bare one-argument log() — base is required, no implicit default", () => {
    expect(() => parseExpression("log(8)")).toThrow(/expects 2 arguments/);
  });

  it("rejects ln() called with two arguments", () => {
    expect(() => parseExpression("ln(8, 2)")).toThrow(/expects 1 argument/);
  });
});
