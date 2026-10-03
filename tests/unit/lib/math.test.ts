import { describe, expect, it } from "vitest";
import { clamp } from "../../../src/lib/math";

describe("clamp", () => {
  it("clamp_withinRange_unchanged", () => expect(clamp(3, 0, 5)).toBe(3));
  it("clamp_belowMin_returnsMin", () => expect(clamp(-1, 0, 5)).toBe(0));
  it("clamp_aboveMax_returnsMax", () => expect(clamp(9, 0, 5)).toBe(5));
  it("clamp_atBounds_unchanged", () => {
    expect(clamp(0, 0, 5)).toBe(0);
    expect(clamp(5, 0, 5)).toBe(5);
  });
});
