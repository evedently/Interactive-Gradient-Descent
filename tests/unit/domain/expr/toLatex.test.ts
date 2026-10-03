import { describe, expect, it } from "vitest";
import { parseExpression } from "../../../../src/domain/expr/parser";
import { exprToLatex } from "../../../../src/domain/expr/toLatex";

describe("exprToLatex", () => {
  it("renders the spec's own example with correct grouping", () => {
    expect(exprToLatex(parseExpression("(x - 3)^2 + 4*(y + 1)^2"))).toBe(
      "\\left(x - 3\\right)^{2} + 4\\cdot \\left(y + 1\\right)^{2}",
    );
  });

  it("renders division as \\frac", () => {
    expect(exprToLatex(parseExpression("x / y"))).toBe("\\frac{x}{y}");
  });

  it("parenthesizes the right operand of a left-associative subtraction", () => {
    expect(exprToLatex(parseExpression("x - (y - 1)"))).toBe("x - \\left(y - 1\\right)");
  });

  it("renders sqrt and abs", () => {
    expect(exprToLatex(parseExpression("sqrt(x)"))).toBe("\\sqrt{x}");
    expect(exprToLatex(parseExpression("abs(x)"))).toBe("\\left|x\\right|");
  });

  it("renders sin, cos, tan, and ln with upright LaTeX macros", () => {
    expect(exprToLatex(parseExpression("sin(x)"))).toBe("\\sin\\left(x\\right)");
    expect(exprToLatex(parseExpression("cos(x)"))).toBe("\\cos\\left(x\\right)");
    expect(exprToLatex(parseExpression("tan(x)"))).toBe("\\tan\\left(x\\right)");
    expect(exprToLatex(parseExpression("ln(x)"))).toBe("\\ln\\left(x\\right)");
  });

  it("renders log(x, base) with the base as a subscript", () => {
    expect(exprToLatex(parseExpression("log(x, 2)"))).toBe("\\log_{2}\\left(x\\right)");
  });

  it("exprToLatex_multiLetterIdentifier_rendersUpright", () => {
    expect(exprToLatex(parseExpression("prediction - y"))).toBe("\\mathrm{prediction} - y");
  });

  it("exprToLatex_underscoreIdentifier_rendersSubscript", () => {
    expect(exprToLatex(parseExpression("theta_0 * x"))).toBe("\\mathrm{theta}_{0}\\cdot x");
    expect(exprToLatex(parseExpression("w_1"))).toBe("w_{1}");
  });

  it("exprToLatex_singleLetterIdentifier_unchanged", () => {
    expect(exprToLatex(parseExpression("w * x + b"))).toBe("w\\cdot x + b");
  });
});
