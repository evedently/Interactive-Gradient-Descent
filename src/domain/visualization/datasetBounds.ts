import type { CompiledPerExampleLoss, Dataset } from "../dataset/types";
import type { PrimaryVariable } from "../rules/ruleCompiler";
import type { GridBounds } from "./grid";

const DEFAULT_HALF_WIDTH = 5;
const INITIAL_VALUE_SPAN_FACTOR = 2;

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

/** An axis-aligned box in parameter space (same shape as `GridBounds`), e.g. the extent of a trajectory. */
export type Extent = GridBounds;

/** Fraction of a trajectory's extent added on each side when the view grows to fit it, so the path isn't drawn on the very edge. */
const FIT_PADDING_FACTOR = 0.25;
/** Minimum padding as a fraction of the home window's span — a single point (zero extent) still gets breathing room. */
const MIN_PADDING_FACTOR = 0.1;
/** The view never grows beyond this many times the home window's span (per axis), however far a run wanders. */
export const MAX_BOUNDS_SPAN_FACTOR = 20;
/** The view shrinks back toward its ideal fit only once it's more than this many times larger (per axis) — e.g. after a Reset. */
const SHRINK_RATIO = 2;

function union(a: Extent, b: Extent): Extent {
  return { xMin: Math.min(a.xMin, b.xMin), xMax: Math.max(a.xMax, b.xMax), yMin: Math.min(a.yMin, b.yMin), yMax: Math.max(a.yMax, b.yMax) };
}

function contains(outer: Extent, inner: Extent): boolean {
  return outer.xMin <= inner.xMin && outer.xMax >= inner.xMax && outer.yMin <= inner.yMin && outer.yMax >= inner.yMax;
}

function padded(e: Extent, home: Extent): Extent {
  const px = Math.max((e.xMax - e.xMin) * FIT_PADDING_FACTOR, (home.xMax - home.xMin) * MIN_PADDING_FACTOR);
  const py = Math.max((e.yMax - e.yMin) * FIT_PADDING_FACTOR, (home.yMax - home.yMin) * MIN_PADDING_FACTOR);
  return { xMin: e.xMin - px, xMax: e.xMax + px, yMin: e.yMin - py, yMax: e.yMax + py };
}

/** Intersects `e` with the largest window allowed around `home`. `e` always contains `home` here, so the result is never empty. */
function capped(e: Extent, home: Extent): Extent {
  const cx = (home.xMin + home.xMax) / 2;
  const cy = (home.yMin + home.yMax) / 2;
  const hx = ((home.xMax - home.xMin) * MAX_BOUNDS_SPAN_FACTOR) / 2;
  const hy = ((home.yMax - home.yMin) * MAX_BOUNDS_SPAN_FACTOR) / 2;
  return { xMin: Math.max(e.xMin, cx - hx), xMax: Math.min(e.xMax, cx + hx), yMin: Math.max(e.yMin, cy - hy), yMax: Math.min(e.yMax, cy + hy) };
}

function oversized(current: Extent, ideal: Extent): boolean {
  return current.xMax - current.xMin > SHRINK_RATIO * (ideal.xMax - ideal.xMin) || current.yMax - current.yMin > SHRINK_RATIO * (ideal.yMax - ideal.yMin);
}

/**
 * The loss-surface window to render next (DESIGN.md §8's auto-fit, Phase 7
 * extension): the `home` window plus whatever the visible, non-diverged
 * trajectories cover (`extent`), capped at `MAX_BOUNDS_SPAN_FACTOR` times
 * home. Returns the SAME `current` reference whenever it still fits, so the
 * caller can skip recomputing the (expensive) grid.
 *
 * - Grows (with padding) as soon as a trajectory leaves the window.
 * - Never shrinks mid-run: a trajectory's extent only grows while it runs.
 * - Shrinks back to the fit once the window is far larger than needed —
 *   after a Reset, or when a diverged run drops out of `extent` — instead of
 *   staying zoomed out to a run that blew up.
 */
export function fitDatasetBounds(current: GridBounds, home: GridBounds, extent: Extent | null): GridBounds {
  const needed = capped(extent ? union(home, extent) : home, home);
  const ideal = capped(extent ? union(home, padded(extent, home)) : home, home);
  if (!contains(current, needed) || oversized(current, ideal)) return ideal;
  return current;
}

/** The smallest box covering every non-null extent, or `null` if there are none. */
export function unionExtents(extents: readonly (Extent | null)[]): Extent | null {
  return extents.reduce<Extent | null>((acc, e) => (e === null ? acc : acc === null ? e : union(acc, e)), null);
}

/**
 * Bounding boxes of trajectories, maintained incrementally: a trajectory
 * array that has only grown since the last call is extended by its new
 * points rather than rescanned, so this stays cheap to call every frame on
 * long runs. A runner's Reset replaces its trajectory array, which starts a
 * fresh extent. Non-finite points are ignored.
 */
export class TrajectoryExtentTracker<P> {
  private readonly cache = new WeakMap<readonly P[], { length: number; extent: Extent | null }>();

  constructor(private readonly toXY: (point: P) => readonly [number, number]) {}

  extentOf(trajectory: readonly P[]): Extent | null {
    const cached = this.cache.get(trajectory);
    const reuse = cached !== undefined && cached.length <= trajectory.length;
    let extent = reuse ? cached.extent : null;
    for (let i = reuse ? cached.length : 0; i < trajectory.length; i++) {
      const [x, y] = this.toXY(trajectory[i]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const point = { xMin: x, xMax: x, yMin: y, yMax: y };
      extent = extent === null ? point : union(extent, point);
    }
    this.cache.set(trajectory, { length: trajectory.length, extent });
    return extent;
  }
}

/** What `resolveDatasetSurfaceBounds` reseeds from and grows — the "problem identity" fields are carried alongside `bounds` purely so the caller can detect a genuine change without re-deriving it itself. */
export interface DatasetSurfaceBoundsState {
  /** The "home" window, seeded from the initial values when the problem changes. */
  bounds: GridBounds;
  /** The window actually rendered: `bounds` fitted to the visible trajectories by `fitDatasetBounds`. */
  view: GridBounds;
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
  const bounds = initialDatasetBounds(initialValues, primaryVariables);
  return { bounds, view: bounds, dataset, perExampleLoss, primaryVariables };
}
