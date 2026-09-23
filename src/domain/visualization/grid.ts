import type { ExprNode } from "../expr/ast";
import { evaluateLoss } from "../lossFunction";

export interface GridBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface LossGrid {
  bounds: GridBounds;
  resolution: number;
  /** row-major, length resolution*resolution; row varies with y, col varies with x. Non-finite values (domain violations, e.g. sqrt(negative)) are preserved, not clamped — DESIGN.md §8's masked-region rendering relies on being able to detect them. */
  values: Float64Array;
  xs: Float64Array;
  ys: Float64Array;
}

/** Samples a loss function on a regular grid over `bounds` at `resolution` samples per axis. */
export function computeLossGrid(ast: ExprNode, bounds: GridBounds, resolution: number): LossGrid {
  const xs = new Float64Array(resolution);
  const ys = new Float64Array(resolution);
  for (let i = 0; i < resolution; i++) {
    const t = resolution === 1 ? 0 : i / (resolution - 1);
    xs[i] = bounds.xMin + (bounds.xMax - bounds.xMin) * t;
    ys[i] = bounds.yMin + (bounds.yMax - bounds.yMin) * t;
  }

  const values = new Float64Array(resolution * resolution);
  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      values[row * resolution + col] = evaluateLoss(ast, xs[col], ys[row]);
    }
  }

  return { bounds, resolution, values, xs, ys };
}

export function finiteRange(values: ArrayLike<number>): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (min > max) return { min: 0, max: 1 }; // no finite values at all
  return { min, max };
}
