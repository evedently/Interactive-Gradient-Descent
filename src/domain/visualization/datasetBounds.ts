import type { CompiledPerExampleLoss, Dataset } from "../dataset/types";
import type { PrimaryVariable } from "../rules/ruleCompiler";
import type { GridBounds } from "./grid";

const DEFAULT_HALF_WIDTH = 5;
const INITIAL_VALUE_SPAN_FACTOR = 2;
const EXPAND_MARGIN_FACTOR = 1.5;

/**
 * A first guess at bounds for the dataset-mode loss surface (DESIGN.md §18
 * Phase 7 extension), before any trajectory exists to fit to: centered on
 * the two primary variables' configured initial values, with a generous
 * default half-width so a typical small-coefficient regression problem
 * starts fully in view.
 */
export function initialDatasetBounds(initialValues: Readonly<Record<string, number>>, primaryVariables: readonly PrimaryVariable[]): GridBounds {
  const [a, b] = primaryVariables;
  const av = initialValues[a.name] ?? 0;
  const bv = initialValues[b.name] ?? 0;
  const halfA = Math.max(DEFAULT_HALF_WIDTH, Math.abs(av) * INITIAL_VALUE_SPAN_FACTOR);
  const halfB = Math.max(DEFAULT_HALF_WIDTH, Math.abs(bv) * INITIAL_VALUE_SPAN_FACTOR);
  return { xMin: av - halfA, xMax: av + halfA, yMin: bv - halfB, yMax: bv + halfB };
}

/**
 * Grows `bounds` just enough to contain `(x, y)` with margin — DESIGN.md
 * §8's auto-fit ("recomputed... whenever needed") applied so the loss
 * surface never clips a trajectory point that has wandered outside the
 * current view. Returns the SAME `bounds` reference when `(x, y)` is
 * already inside, so a caller can cheaply skip re-rendering/recomputing
 * the (expensive) grid on the common case where nothing needs to change.
 */
export function expandBoundsToInclude(bounds: GridBounds, x: number, y: number): GridBounds {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return bounds;
  const xOutside = x < bounds.xMin || x > bounds.xMax;
  const yOutside = y < bounds.yMin || y > bounds.yMax;
  if (!xOutside && !yOutside) return bounds;

  let { xMin, xMax, yMin, yMax } = bounds;
  if (xOutside) {
    xMin = Math.min(bounds.xMin, x);
    xMax = Math.max(bounds.xMax, x);
    const margin = (xMax - xMin) * (EXPAND_MARGIN_FACTOR - 1);
    xMin -= margin / 2;
    xMax += margin / 2;
  }
  if (yOutside) {
    yMin = Math.min(bounds.yMin, y);
    yMax = Math.max(bounds.yMax, y);
    const margin = (yMax - yMin) * (EXPAND_MARGIN_FACTOR - 1);
    yMin -= margin / 2;
    yMax += margin / 2;
  }
  return { xMin, xMax, yMin, yMax };
}

/** What `resolveDatasetSurfaceBounds` reseeds from and grows — the "problem identity" fields are carried alongside `bounds` purely so the caller can detect a genuine change without re-deriving it itself. */
export interface DatasetSurfaceBoundsState {
  bounds: GridBounds;
  dataset: Dataset | null;
  perExampleLoss: CompiledPerExampleLoss | null;
  primaryVariables: readonly PrimaryVariable[];
}

/**
 * Decides the loss-surface bounds `DatasetWorkspaceView` should render with
 * next (DESIGN.md §8's auto-fit, Phase 7 extension) — reseeded from
 * `initialDatasetBounds` only when the PROBLEM ITSELF changes (a new
 * dataset, a newly-compiled per-example loss, or renamed/added primary
 * variables), by reference comparison against `current`. Changing only
 * `initialValues` — e.g. dragging the start-point marker, or typing a new
 * initial value — must NEVER reseed the bounds: the rendered domain (and
 * therefore the surface/contour's z- and color-scaling, both derived from
 * the grid sampled over these bounds) has to stay fixed while only the
 * marker and trajectories move. This is the fix for a bug where dragging
 * the marker was recentering — and so silently rescaling — the whole
 * surface underneath it.
 */
export function resolveDatasetSurfaceBounds(
  current: DatasetSurfaceBoundsState | null,
  dataset: Dataset | null,
  perExampleLoss: CompiledPerExampleLoss | null,
  primaryVariables: readonly PrimaryVariable[],
  initialValues: Readonly<Record<string, number>>,
): DatasetSurfaceBoundsState {
  const problemUnchanged =
    current !== null &&
    current.dataset === dataset &&
    current.perExampleLoss === perExampleLoss &&
    current.primaryVariables === primaryVariables;
  if (problemUnchanged) return current;
  return { bounds: initialDatasetBounds(initialValues, primaryVariables), dataset, perExampleLoss, primaryVariables };
}
