import { describe, expect, it } from "vitest";
import { decimateForDisplay } from "../../../../src/domain/visualization/decimate";

describe("decimateForDisplay (DESIGN.md §18 Phase 9: decimation for long runs)", () => {
  it("returns the array unchanged when it's already within the cap", () => {
    const points = [1, 2, 3];
    expect(decimateForDisplay(points, 10)).toEqual([1, 2, 3]);
  });

  it("returns the array unchanged when it exactly equals the cap", () => {
    const points = [1, 2, 3];
    expect(decimateForDisplay(points, 3)).toEqual([1, 2, 3]);
  });

  it("thins a long array down to exactly maxPoints", () => {
    const points = Array.from({ length: 10_000 }, (_, i) => i);
    const result = decimateForDisplay(points, 100);
    expect(result).toHaveLength(100);
  });

  it("always keeps the first and last point exactly — the current position must never be thinned away", () => {
    const points = Array.from({ length: 10_000 }, (_, i) => i);
    const result = decimateForDisplay(points, 100);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(9999);
  });

  it("preserves ascending order (never reorders points)", () => {
    const points = Array.from({ length: 5_000 }, (_, i) => i);
    const result = decimateForDisplay(points, 37);
    for (let i = 1; i < result.length; i++) expect(result[i]).toBeGreaterThan(result[i - 1]);
  });

  it("is a no-op for an empty array", () => {
    expect(decimateForDisplay([], 100)).toEqual([]);
  });

  it("returns just the last point when maxPoints is 1", () => {
    const points = [10, 20, 30, 40];
    expect(decimateForDisplay(points, 1)).toEqual([40]);
  });

  it("never mutates the input array", () => {
    const points = Array.from({ length: 500 }, (_, i) => i);
    const copy = [...points];
    decimateForDisplay(points, 50);
    expect(points).toEqual(copy);
  });
});
