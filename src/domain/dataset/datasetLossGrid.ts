import type { PrimaryVariable } from "../rules/ruleCompiler";
import type { GridBounds } from "../visualization/grid";
import { computeFullDatasetLoss } from "./evaluatePerExampleLoss";
import type { CompiledPerExampleLoss, Dataset } from "./types";

/** Lower than surface mode's `SURFACE_RESOLUTION` (60): each cell here costs one full-dataset pass (O(rows)), not one closed-form evaluation, so the same resolution would be `rows` times more expensive. */
export const DATASET_SURFACE_RESOLUTION = 30;

export interface DatasetLossGrid {
  bounds: GridBounds;
  resolution: number;
  /** row-major, length resolution*resolution; row varies with the second primary variable, col with the first — same convention as `computeLossGrid` (surface mode). */
  values: Float64Array;
  xs: Float64Array;
  ys: Float64Array;
}

/**
 * Samples the FULL-dataset loss (mean per-example loss over every row, not
 * a mini-batch) on a regular grid over the workspace's two primary
 * variables (DESIGN.md §18 Phase 7 extension: "generate a 3D full-dataset
 * loss surface"). Deliberately requires exactly two primary variables —
 * a loss surface over more than two dimensions can't be drawn, and the
 * caller (`DatasetWorkspaceView`) is expected to fall back to metric plots
 * instead of calling this when `primaryVariables.length !== 2`.
 */
export function computeDatasetLossGrid(
  perExampleLoss: CompiledPerExampleLoss,
  dataset: Dataset,
  primaryVariables: readonly PrimaryVariable[],
  bounds: GridBounds,
  resolution: number,
): DatasetLossGrid {
  if (primaryVariables.length !== 2) {
    throw new Error(`computeDatasetLossGrid requires exactly two primary variables, got ${primaryVariables.length}`);
  }
  const [aName, bName] = primaryVariables.map((v) => v.name);

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
      const coords = { [aName]: xs[col], [bName]: ys[row] };
      values[row * resolution + col] = computeFullDatasetLoss(perExampleLoss, dataset, coords);
    }
  }

  return { bounds, resolution, values, xs, ys };
}
