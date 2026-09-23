/**
 * Multi-stop color ramp for a normalized [0,1] loss level — shared by every
 * contour plot AND the 3D surfaces' own vertex coloring (surface and
 * dataset mode), so a presenter reads the same "cold basin, hot ridge"
 * mapping regardless of which view they're looking at. A five-stop
 * blue -> cyan -> green -> yellow -> red ramp reads with much more
 * contrast between adjacent contour bands than a two-stop blue->yellow
 * interpolation, especially once several bands sit close together near a
 * loss minimum. No external color-scale dependency.
 */
const COLOR_STOPS: readonly [number, number, number][] = [
  [37, 34, 143], // deep blue — lowest loss
  [31, 148, 191], // cyan
  [82, 191, 96], // green
  [232, 213, 45], // yellow
  [214, 39, 36], // red — highest loss
];

/** Returns the ramp's color at `t` (clamped to [0,1]) as 0–255 integer RGB components. */
export function colorForLevelRGB(t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  const segments = COLOR_STOPS.length - 1;
  const scaled = clamped * segments;
  const index = Math.min(segments - 1, Math.floor(scaled));
  const localT = scaled - index;
  const [r0, g0, b0] = COLOR_STOPS[index];
  const [r1, g1, b1] = COLOR_STOPS[index + 1];
  return [Math.round(r0 + (r1 - r0) * localT), Math.round(g0 + (g1 - g0) * localT), Math.round(b0 + (b1 - b0) * localT)];
}

/** Canvas-ready `rgb(...)` string form of `colorForLevelRGB`, for the 2D contour renderers. */
export function colorForLevel(t: number): string {
  const [r, g, b] = colorForLevelRGB(t);
  return `rgb(${r},${g},${b})`;
}

/** Three.js vertex-color form of `colorForLevelRGB` — 0–1 floats, for the 3D surfaces' per-vertex loss coloring. */
export function colorForLevelNormalized(t: number): [number, number, number] {
  const [r, g, b] = colorForLevelRGB(t);
  return [r / 255, g / 255, b / 255];
}
