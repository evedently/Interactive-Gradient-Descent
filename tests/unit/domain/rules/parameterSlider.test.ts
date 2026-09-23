import { describe, expect, it } from "vitest";
import { sliderPositionToValue, valueToSliderPosition } from "../../../../src/domain/rules/parameterSlider";
import type { ParameterDecl } from "../../../../src/domain/rules/ruleCompiler";

describe("linear parameter sliders", () => {
  const decl: ParameterDecl = { name: "eta", defaultValue: 0.5, min: 0, max: 1, log: false };

  it("maps value <-> position linearly", () => {
    expect(valueToSliderPosition(0, decl)).toBe(0);
    expect(valueToSliderPosition(1, decl)).toBe(1);
    expect(valueToSliderPosition(0.5, decl)).toBeCloseTo(0.5, 9);
    expect(sliderPositionToValue(0.25, decl)).toBeCloseTo(0.25, 9);
  });

  it("round-trips", () => {
    for (const v of [0, 0.1, 0.37, 0.9, 1]) {
      expect(sliderPositionToValue(valueToSliderPosition(v, decl), decl)).toBeCloseTo(v, 9);
    }
  });

  it("clamps positions to [0, 1]", () => {
    expect(sliderPositionToValue(-1, decl)).toBe(0);
    expect(sliderPositionToValue(2, decl)).toBe(1);
  });
});

describe("log-scale parameter sliders", () => {
  const decl: ParameterDecl = { name: "eta", defaultValue: 0.01, min: 0.0001, max: 1, log: true };

  it("maps the range endpoints to 0 and 1", () => {
    expect(valueToSliderPosition(0.0001, decl)).toBeCloseTo(0, 9);
    expect(valueToSliderPosition(1, decl)).toBeCloseTo(1, 9);
  });

  it("places equal-ratio values at equal position increments", () => {
    // 0.0001 -> 0.001 -> 0.01 -> 0.1 -> 1 are four equal *multiplicative* steps.
    const positions = [0.0001, 0.001, 0.01, 0.1, 1].map((v) => valueToSliderPosition(v, decl));
    const deltas = positions.slice(1).map((p, i) => p - positions[i]);
    for (const d of deltas) expect(d).toBeCloseTo(deltas[0], 9);
  });

  it("round-trips", () => {
    for (const v of [0.0001, 0.001, 0.05, 0.5, 1]) {
      expect(sliderPositionToValue(valueToSliderPosition(v, decl), decl)).toBeCloseTo(v, 6);
    }
  });
});
