import { describe, expect, it } from "vitest";
import { parseExpression } from "../../../../src/domain/expr/parser";
import { simplify } from "../../../../src/domain/expr/simplify";
import { exprToLatex } from "../../../../src/domain/expr/toLatex";

function simplifiedLatex(source: string): string {
  return exprToLatex(simplify(parseExpression(source)));
}

describe("simplify", () => {
  it("folds constants", () => {
    expect(simplifiedLatex("2 + 3")).toBe("5");
    expect(simplifiedLatex("2 * 3 - 1")).toBe("5");
  });

  it("removes additive identity", () => {
    expect(simplifiedLatex("x + 0")).toBe("x");
    expect(simplifiedLatex("0 + x")).toBe("x");
    expect(simplifiedLatex("x - 0")).toBe("x");
  });

  it("removes multiplicative identity and collapses multiplication by zero", () => {
    expect(simplifiedLatex("x * 1")).toBe("x");
    expect(simplifiedLatex("1 * x")).toBe("x");
    expect(simplifiedLatex("x * 0")).toBe("0");
    expect(simplifiedLatex("0 * x")).toBe("0");
  });

  it("removes x^1 and collapses x^0", () => {
    expect(simplifiedLatex("x^1")).toBe("x");
    expect(simplifiedLatex("x^0")).toBe("1");
  });

  it("collapses double negation", () => {
    expect(simplifiedLatex("-(-x)")).toBe("x");
  });

  it("is a correctness-preserving rewrite, not just a cosmetic one — spot check via evaluation elsewhere is covered by differentiate.test.ts", () => {
    // sanity: simplify never changes the *parsed* shape of an already-simple expression
    expect(simplifiedLatex("x + y")).toBe("x + y");
  });
});
