import { clamp } from "../../lib/math";
import type { GridBounds } from "./grid";

export interface CanvasTransform {
  /** Loss-space (x, y) → canvas pixels. Canvas Y grows downward, so larger y is drawn higher up. */
  toCanvas(x: number, y: number): { px: number; py: number };
  /** Canvas pixels → loss-space (x, y), clamped to the canvas (and therefore to `bounds`). */
  fromCanvas(px: number, py: number): { x: number; y: number };
}

/** Maps a `width`×`height` drawing area (square when `height` is omitted) onto `bounds` — shared by the contour plots and the data plot. */
export function canvasTransform(bounds: GridBounds, width: number, height = width): CanvasTransform {
  const spanX = bounds.xMax - bounds.xMin;
  const spanY = bounds.yMax - bounds.yMin;
  return {
    toCanvas: (x, y) => ({
      px: ((x - bounds.xMin) / spanX) * width,
      py: height - ((y - bounds.yMin) / spanY) * height,
    }),
    fromCanvas: (px, py) => ({
      x: bounds.xMin + (clamp(px, 0, width) / width) * spanX,
      y: bounds.yMin + (1 - clamp(py, 0, height) / height) * spanY,
    }),
  };
}

/** `count` evenly spaced contour thresholds starting at `min` and spanning `span`. */
export function contourLevels(min: number, span: number, count: number): number[] {
  const step = span / count;
  return Array.from({ length: count }, (_, i) => min + i * step);
}
