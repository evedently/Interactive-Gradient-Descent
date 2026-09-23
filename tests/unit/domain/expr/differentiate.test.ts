import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseExpression } from "../../../../src/domain/expr/parser";
import { evaluateExpr } from "../../../../src/domain/expr/evaluate";
import { symbolicDerivative } from "../../../../src/domain/expr/differentiate";
import { simplify } from "../../../../src/domain/expr/simplify";
import { numericGradient2D } from "../../../../src/domain/expr/numericGradient";
import { exprToLatex } from "../../../../src/domain/expr/toLatex";

function symbolicGradientAt(source: string, x: number, y: number) {
  const ast = parseExpression(source);
  const gxAst = simplify(symbolicDerivative(ast, "x"));
  const gyAst = simplify(symbolicDerivative(ast, "y"));
  return {
    gx: evaluateExpr(gxAst, { x, y }),
    gy: evaluateExpr(gyAst, { x, y }),
    gxAst,
    gyAst,
  };
}

describe("symbolicDerivative: hand-computed acceptance cases", () => {
  it("matches the spec's own loss function exactly: d/dx (x-3)^2 = 2(x-3), d/dy 4(y+1)^2 = 8(y+1)", () => {
    const { gx, gy } = symbolicGradientAt("(x - 3)^2 + 4*(y + 1)^2", 0, 0);
    expect(gx).toBeCloseTo(-6, 9); // 2*(0-3) = -6
    expect(gy).toBeCloseTo(8, 9); // 8*(0+1) = 8
  });

  it("produces a readable simplified expression, not a mechanically bloated one", () => {
    const { gxAst } = symbolicGradientAt("(x - 3)^2", 0, 0);
    // simplify should collapse the exponent-1 term and the trailing *1 from d/dx(x-3)
    expect(exprToLatex(gxAst)).toBe("2\\cdot \\left(x - 3\\right)");
  });

  it("re-associates a nested constant factor from the product rule: d/dy 4(y+1)^2 = 8(y+1), not 4*(2*(y+1))", () => {
    const { gyAst } = symbolicGradientAt("4*(y + 1)^2", 0, 0);
    expect(exprToLatex(gyAst)).toBe("8\\cdot \\left(y + 1\\right)");
  });

  it("product rule: d/dx (x*y) = y, d/dy (x*y) = x", () => {
    const { gx, gy } = symbolicGradientAt("x * y", 3, 5);
    expect(gx).toBeCloseTo(5, 9);
    expect(gy).toBeCloseTo(3, 9);
  });

  it("quotient rule: d/dx (x / y) = 1/y", () => {
    const { gx } = symbolicGradientAt("x / y", 2, 4);
    expect(gx).toBeCloseTo(1 / 4, 9);
  });

  it("chain rule through sqrt: d/dx sqrt(x^2+y^2) = x / sqrt(x^2+y^2)", () => {
    const { gx, gy } = symbolicGradientAt("sqrt(x^2 + y^2)", 3, 4);
    expect(gx).toBeCloseTo(3 / 5, 9);
    expect(gy).toBeCloseTo(4 / 5, 9);
  });

  it("chain rule through sin/cos: d/dx sin(x*y) = y*cos(x*y)", () => {
    const { gx } = symbolicGradientAt("sin(x * y)", 1, 2);
    expect(gx).toBeCloseTo(2 * Math.cos(2), 9);
  });

  it("chain rule through tan: d/dx tan(x) = 1/cos(x)^2", () => {
    const { gx } = symbolicGradientAt("tan(x)", 0.4, 0);
    expect(gx).toBeCloseTo(1 / Math.cos(0.4) ** 2, 9);
  });

  it("chain rule through exp: d/dx exp(x*y) = y*exp(x*y)", () => {
    const { gx } = symbolicGradientAt("exp(x * y)", 1, 2);
    expect(gx).toBeCloseTo(2 * Math.exp(2), 9);
  });

  it("chain rule through ln: d/dx ln(x) = 1/x", () => {
    const { gx } = symbolicGradientAt("ln(x)", 5, 0);
    expect(gx).toBeCloseTo(1 / 5, 9);
  });

  it("log(x, base): d/dx log(x, 2) = 1 / (x * ln(2))", () => {
    const { gx } = symbolicGradientAt("log(x, 2)", 8, 0);
    expect(gx).toBeCloseTo(1 / (8 * Math.log(2)), 9);
  });

  it("generalized power rule with a non-constant exponent: d/dx x^y = y * x^(y-1)", () => {
    const { gx } = symbolicGradientAt("x^y", 2, 3);
    expect(gx).toBeCloseTo(3 * 2 ** 2, 6);
  });

  it("throws if asked to differentiate through abs/min/max — caller must check isFullySmooth first", () => {
    expect(() => symbolicDerivative(parseExpression("abs(x)"), "x")).toThrow();
    expect(() => symbolicDerivative(parseExpression("min(x, y)"), "x")).toThrow();
  });
});

describe("symbolicDerivative: property-based cross-check against numeric differentiation", () => {
  const smoothExpr = fc
    .letrec((tie) => ({
      leaf: fc.oneof(
        fc.constant<{ kind: "x" }>({ kind: "x" }),
        fc.constant<{ kind: "y" }>({ kind: "y" }),
        fc.double({ min: 0.5, max: 5, noNaN: true }).map((v) => ({ kind: "num" as const, value: v })),
      ),
      expr: fc.oneof(
        { maxDepth: 3 },
        tie("leaf") as fc.Arbitrary<unknown>,
        fc.tuple(fc.constantFrom("+", "-", "*"), tie("expr"), tie("expr")).map(([op, l, r]) => ({ kind: "bin", op, l, r })),
        fc.tuple(fc.constantFrom("sin", "cos"), tie("expr")).map(([fn, a]) => ({ kind: "call", fn, a })),
      ),
    }))
    .expr as fc.Arbitrary<unknown>;

  function toSource(node: unknown): string {
    const n = node as { kind: string; op?: string; l?: unknown; r?: unknown; fn?: string; a?: unknown; value?: number };
    if (n.kind === "x") return "x";
    if (n.kind === "y") return "y";
    if (n.kind === "num") return `(${n.value})`;
    if (n.kind === "bin") return `(${toSource(n.l)} ${n.op} ${toSource(n.r)})`;
    if (n.kind === "call") return `${n.fn}(${toSource(n.a)})`;
    throw new Error("bad node");
  }

  it("symbolic gradient matches numeric central-difference within tolerance, for random smooth expressions", () => {
    fc.assert(
      fc.property(smoothExpr, fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: -3, max: 3, noNaN: true }), (node, x, y) => {
        const source = toSource(node);
        const ast = parseExpression(source);
        const gxSym = evaluateExpr(simplify(symbolicDerivative(ast, "x")), { x, y });
        const gySym = evaluateExpr(simplify(symbolicDerivative(ast, "y")), { x, y });
        const f = (px: number, py: number) => evaluateExpr(ast, { x: px, y: py });
        const { gx: gxNum, gy: gyNum } = numericGradient2D(f, x, y);

        if (!Number.isFinite(gxSym) || !Number.isFinite(gxNum) || !Number.isFinite(gySym) || !Number.isFinite(gyNum)) {
          return true; // domain edge case (e.g. near a cos()=0 in a generated expression) — not what this property checks
        }
        expect(gxSym).toBeCloseTo(gxNum, 3);
        expect(gySym).toBeCloseTo(gyNum, 3);
      }),
      { numRuns: 200 },
    );
  });
});
