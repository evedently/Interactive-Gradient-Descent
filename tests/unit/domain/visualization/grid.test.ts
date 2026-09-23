import { describe, expect, it } from "vitest";
import { parseExpression } from "../../../../src/domain/expr/parser";
import { computeLossGrid, finiteRange } from "../../../../src/domain/visualization/grid";

describe("computeLossGrid", () => {
  it("samples a smooth function on a regular grid", () => {
    const ast = parseExpression("(x - 3)^2 + 4*(y + 1)^2");
    const grid = computeLossGrid(ast, { xMin: 0, xMax: 6, yMin: -3, yMax: 1 }, 5);
    expect(grid.values).toHaveLength(25);
    expect(grid.xs[0]).toBeCloseTo(0);
    expect(grid.xs[4]).toBeCloseTo(6);
    // grid.xs[2] = 3, grid.ys[2] = -1 -> exact minimum -> loss 0
    const midIndex = 2 * grid.resolution + 2;
    expect(grid.values[midIndex]).toBeCloseTo(0, 9);
  });

  it("preserves NaN for domain violations rather than clamping them", () => {
    const ast = parseExpression("sqrt(x)");
    const grid = computeLossGrid(ast, { xMin: -2, xMax: 2, yMin: 0, yMax: 1 }, 5);
    const hasNaN = Array.from(grid.values).some((v) => Number.isNaN(v));
    const hasFinite = Array.from(grid.values).some((v) => Number.isFinite(v));
    expect(hasNaN).toBe(true);
    expect(hasFinite).toBe(true);
  });
});

describe("finiteRange", () => {
  it("computes min/max ignoring non-finite entries", () => {
    const { min, max } = finiteRange([1, NaN, 5, Infinity, -3]);
    expect(min).toBe(-3);
    expect(max).toBe(5);
  });

  it("falls back to a default range when nothing is finite", () => {
    const { min, max } = finiteRange([NaN, Infinity, -Infinity]);
    expect(min).toBe(0);
    expect(max).toBe(1);
  });
});
