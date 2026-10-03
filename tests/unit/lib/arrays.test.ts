import { describe, expect, it } from "vitest";
import { shallowEqualArrays } from "../../../src/lib/arrays";

describe("shallowEqualArrays", () => {
  it("shallowEqualArrays_sameElementsSameOrder_true", () => {
    const a = {};
    const b = {};
    expect(shallowEqualArrays([a, b], [a, b])).toBe(true);
  });

  it("shallowEqualArrays_bothEmpty_true", () => {
    expect(shallowEqualArrays([], [])).toBe(true);
  });

  it("shallowEqualArrays_differentLength_false", () => {
    const a = {};
    expect(shallowEqualArrays([a], [a, a])).toBe(false);
  });

  it("shallowEqualArrays_structurallyEqualButDistinctObjects_false", () => {
    expect(shallowEqualArrays([{ x: 1 }], [{ x: 1 }])).toBe(false);
  });

  it("shallowEqualArrays_reordered_false", () => {
    const a = {};
    const b = {};
    expect(shallowEqualArrays([a, b], [b, a])).toBe(false);
  });
});
