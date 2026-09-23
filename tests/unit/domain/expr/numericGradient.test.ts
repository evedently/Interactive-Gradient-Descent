import { describe, expect, it } from "vitest";
import { numericGradient2D, numericGradientN } from "../../../../src/domain/expr/numericGradient";

describe("numericGradient2D", () => {
  it("approximates the analytic gradient of f(x,y) = (x-3)^2 + 4(y+1)^2 within tolerance", () => {
    const f = (x: number, y: number) => (x - 3) ** 2 + 4 * (y + 1) ** 2;
    const { gx, gy } = numericGradient2D(f, 0, 0);
    // Analytic: df/dx = 2(x-3) = -6 ; df/dy = 8(y+1) = 8
    expect(gx).toBeCloseTo(-6, 5);
    expect(gy).toBeCloseTo(8, 5);
  });

  it("is close to zero at the minimum", () => {
    const f = (x: number, y: number) => (x - 3) ** 2 + 4 * (y + 1) ** 2;
    const { gx, gy } = numericGradient2D(f, 3, -1);
    expect(gx).toBeCloseTo(0, 4);
    expect(gy).toBeCloseTo(0, 4);
  });
});

describe("numericGradientN", () => {
  it("approximates the analytic gradient of an arbitrary-named two-variable function within tolerance", () => {
    const f = (coords: Readonly<Record<string, number>>) => (coords.weight - 3) ** 2 + 4 * (coords.bias + 1) ** 2;
    const gradient = numericGradientN(f, { weight: 0, bias: 0 }, ["weight", "bias"]);
    expect(gradient.weight).toBeCloseTo(-6, 5);
    expect(gradient.bias).toBeCloseTo(8, 5);
  });

  it("returns one entry per requested name, independent of extra coords not asked for", () => {
    const f = (coords: Readonly<Record<string, number>>) => coords.a * coords.a + coords.b;
    const gradient = numericGradientN(f, { a: 2, b: 5, unused: 100 }, ["a"]);
    expect(Object.keys(gradient)).toEqual(["a"]);
    expect(gradient.a).toBeCloseTo(4, 4);
  });
});
