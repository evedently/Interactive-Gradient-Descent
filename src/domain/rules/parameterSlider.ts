import type { ParameterDecl } from "./ruleCompiler";

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/**
 * Maps a parameter's current value to a 0..1 slider position. For a
 * `log`-scale parameter (declared range minimum is always positive — see
 * `ruleParser.ts`'s validation) the mapping is logarithmic, so equal slider
 * movement multiplies the value by a constant factor rather than adding a
 * constant amount — the conventional feel for a learning-rate-style
 * parameter spanning several orders of magnitude.
 */
export function valueToSliderPosition(value: number, decl: ParameterDecl): number {
  if (decl.log) {
    const t = (Math.log(value) - Math.log(decl.min)) / (Math.log(decl.max) - Math.log(decl.min));
    return clamp01(t);
  }
  return clamp01((value - decl.min) / (decl.max - decl.min));
}

/** Inverse of `valueToSliderPosition`. */
export function sliderPositionToValue(position: number, decl: ParameterDecl): number {
  const t = clamp01(position);
  if (decl.log) {
    return Math.exp(Math.log(decl.min) + t * (Math.log(decl.max) - Math.log(decl.min)));
  }
  return decl.min + t * (decl.max - decl.min);
}
