import { clamp } from "../../lib/math";
import type { GridBounds } from "./grid";

export interface CanvasTransform {
  /** Loss-space (x, y) → canvas pixels. Canvas Y grows downward, so larger y is drawn higher up. */
  toCanvas(x: number, y: number): { px: number; py: number };
  /** Canvas pixels → loss-space (x, y), clamped to the canvas (and therefore to `bounds`). */
  fromCanvas(px: number, py: number): { x: number; y: number };
}

/** Maps a square `size`×`size` canvas onto `bounds` — shared by both contour plots. */
export function canvasTransform(bounds: GridBounds, size: number): CanvasTransform {
  const width = bounds.xMax - bounds.xMin;
  const height = bounds.yMax - bounds.yMin;
  return {
    toCanvas: (x, y) => ({
      px: ((x - bounds.xMin) / width) * size,
      py: size - ((y - bounds.yMin) / height) * size,
    }),
    fromCanvas: (px, py) => ({
      x: bounds.xMin + (clamp(px, 0, size) / size) * width,
      y: bounds.yMin + (1 - clamp(py, 0, size) / size) * height,
    }),
  };
}

/** `count` evenly spaced contour thresholds starting at `min` and spanning `span`. */
export function contourLevels(min: number, span: number, count: number): number[] {
  const step = span / count;
  return Array.from({ length: count }, (_, i) => min + i * step);
}
