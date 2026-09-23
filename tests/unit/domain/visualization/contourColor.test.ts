import { describe, expect, it } from "vitest";
import { colorForLevel, colorForLevelNormalized, colorForLevelRGB } from "../../../../src/domain/visualization/contourColor";

describe("colorForLevelRGB", () => {
  it("returns the first stop's color at t=0 and the last stop's at t=1", () => {
    expect(colorForLevelRGB(0)).toEqual([37, 34, 143]);
    expect(colorForLevelRGB(1)).toEqual([214, 39, 36]);
  });

  it("clamps out-of-range t to the nearest end", () => {
    expect(colorForLevelRGB(-5)).toEqual(colorForLevelRGB(0));
    expect(colorForLevelRGB(5)).toEqual(colorForLevelRGB(1));
  });

  it("produces distinct colors at evenly spaced levels (visual separation across bands)", () => {
    const samples = [0, 0.25, 0.5, 0.75, 1].map(colorForLevelRGB);
    const unique = new Set(samples.map((c) => c.join(",")));
    expect(unique.size).toBe(samples.length);
  });

  it("is monotonically non-constant between adjacent stops (interpolates, doesn't jump)", () => {
    const a = colorForLevelRGB(0.1);
    const b = colorForLevelRGB(0.15);
    expect(a).not.toEqual(b);
  });
});

describe("colorForLevel", () => {
  it("formats as an rgb() string matching colorForLevelRGB", () => {
    const [r, g, b] = colorForLevelRGB(0.5);
    expect(colorForLevel(0.5)).toBe(`rgb(${r},${g},${b})`);
  });
});

describe("colorForLevelNormalized", () => {
  it("divides each RGB component by 255", () => {
    const [r, g, b] = colorForLevelRGB(0.5);
    const [nr, ng, nb] = colorForLevelNormalized(0.5);
    expect(nr).toBeCloseTo(r / 255, 6);
    expect(ng).toBeCloseTo(g / 255, 6);
    expect(nb).toBeCloseTo(b / 255, 6);
  });

  it("stays within [0,1]", () => {
    for (const t of [0, 0.3, 0.7, 1]) {
      for (const component of colorForLevelNormalized(t)) {
        expect(component).toBeGreaterThanOrEqual(0);
        expect(component).toBeLessThanOrEqual(1);
      }
    }
  });
});
