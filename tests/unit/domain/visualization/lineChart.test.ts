import { describe, expect, it } from "vitest";
import { buildPolylinePoints, computeValueDomain, scaleToPixels } from "../../../../src/domain/visualization/lineChart";

describe("computeValueDomain", () => {
  it("returns the min/max of a normal set of values", () => {
    expect(computeValueDomain([1, 5, 3])).toEqual({ min: 1, max: 5 });
  });

  it("ignores non-finite values", () => {
    expect(computeValueDomain([1, NaN, 5, Infinity])).toEqual({ min: 1, max: 5 });
  });

  it("pads a degenerate all-equal domain so it doesn't collapse to zero width", () => {
    const domain = computeValueDomain([2, 2, 2]);
    expect(domain.min).toBeLessThan(2);
    expect(domain.max).toBeGreaterThan(2);
  });

  it("falls back to [0,1] for an empty or all-non-finite input", () => {
    expect(computeValueDomain([])).toEqual({ min: 0, max: 1 });
    expect(computeValueDomain([NaN, Infinity])).toEqual({ min: 0, max: 1 });
  });
});

describe("scaleToPixels", () => {
  it("maps the domain's min/max to the pixel range's ends", () => {
    expect(scaleToPixels(0, { min: 0, max: 10 }, 0, 100)).toBeCloseTo(0);
    expect(scaleToPixels(10, { min: 0, max: 10 }, 0, 100)).toBeCloseTo(100);
    expect(scaleToPixels(5, { min: 0, max: 10 }, 0, 100)).toBeCloseTo(50);
  });

  it("clamps values outside the domain to the nearest end", () => {
    expect(scaleToPixels(-5, { min: 0, max: 10 }, 0, 100)).toBeCloseTo(0);
    expect(scaleToPixels(15, { min: 0, max: 10 }, 0, 100)).toBeCloseTo(100);
  });
});

describe("buildPolylinePoints", () => {
  it("returns an empty string for no values", () => {
    expect(buildPolylinePoints([], { min: 0, max: 1 }, 100, 50)).toBe("");
  });

  it("spans the full width from the first to the last point", () => {
    const points = buildPolylinePoints([0, 5, 10], { min: 0, max: 10 }, 100, 50);
    const pairs = points.split(" ").map((p) => p.split(",").map(Number));
    expect(pairs[0][0]).toBeCloseTo(0);
    expect(pairs[pairs.length - 1][0]).toBeCloseTo(100);
  });

  it("plots a larger value higher (smaller y) than a smaller value", () => {
    const points = buildPolylinePoints([0, 10], { min: 0, max: 10 }, 100, 50);
    const pairs = points.split(" ").map((p) => p.split(",").map(Number));
    expect(pairs[1][1]).toBeLessThan(pairs[0][1]);
  });

  it("a single value plots at x=0", () => {
    const points = buildPolylinePoints([7], { min: 0, max: 10 }, 100, 50);
    const [x] = points.split(",").map(Number);
    expect(x).toBeCloseTo(0);
  });
});
