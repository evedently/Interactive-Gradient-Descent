import * as THREE from "three";
import type { ExprNode } from "../expr/ast";
import { colorForLevelNormalized } from "./contourColor";
import { computeLossGrid, finiteRange, type GridBounds, type LossGrid } from "./grid";

/** Surface mode's default view bounds — presenter-configurable (workspace-level `surfaceBounds`, §8) so functions whose interesting landscape sits at a much smaller or larger scale than ±10 can still be framed. This is only the fallback used before the presenter changes it, and by tests that don't care about a specific range. */
export const DEFAULT_SURFACE_BOUNDS: GridBounds = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
export const SURFACE_RESOLUTION = 60;
export const VISUAL_HEIGHT = 4;

export interface SurfaceGeometryResult {
  geometry: THREE.BufferGeometry;
  min: number;
  max: number;
  span: number;
}

/**
 * Builds a 3D surface mesh (world X/Z = the grid's two axes, world Y = a
 * normalized display height) from an already-sampled grid — DESIGN.md
 * §14's masked-region rendering: any cell with a non-finite value is
 * skipped entirely rather than clamped, leaving a visible gap instead of a
 * crash or a wrong surface. Height is normalized to a fixed visual range
 * because raw magnitude varies hugely across user-typed functions/datasets
 * and would otherwise make the surface unusably tall or flat.
 *
 * Shared by surface mode's `buildSurfaceGeometry` (below) and dataset
 * mode's loss-surface view (DESIGN.md §18 Phase 7 extension) — both grids
 * have the same row-major `{xs, ys, values}` shape, just sampled from a
 * different source (a closed-form `f(x,y)` vs. a full-dataset per-example
 * loss average), so the triangulation logic itself needs no duplication.
 *
 * Each vertex also gets a color from the exact same ramp the 2D contour
 * plots use (`colorForLevelNormalized`), so the 3D surface reads as the
 * contour map wrapped around the mesh rather than a flat, uninformative
 * blue — the material consuming this geometry must enable `vertexColors`.
 */
export function buildGeometryFromGrid(grid: Pick<LossGrid, "resolution" | "xs" | "ys" | "values">): SurfaceGeometryResult {
  const { min, max } = finiteRange(grid.values);
  const span = max - min || 1;
  const res = grid.resolution;

  const positions = new Float32Array(res * res * 3);
  const colors = new Float32Array(res * res * 3);
  for (let row = 0; row < res; row++) {
    for (let col = 0; col < res; col++) {
      const idx = row * res + col;
      const v = grid.values[idx];
      const height = Number.isFinite(v) ? ((v - min) / span) * VISUAL_HEIGHT : 0;
      positions[idx * 3] = grid.xs[col];
      positions[idx * 3 + 1] = height;
      positions[idx * 3 + 2] = grid.ys[row];
      const [r, g, b] = colorForLevelNormalized(Number.isFinite(v) ? (v - min) / span : 0);
      colors[idx * 3] = r;
      colors[idx * 3 + 1] = g;
      colors[idx * 3 + 2] = b;
    }
  }

  const isValid = (row: number, col: number) => Number.isFinite(grid.values[row * res + col]);
  const indices: number[] = [];
  for (let row = 0; row < res - 1; row++) {
    for (let col = 0; col < res - 1; col++) {
      if (!isValid(row, col) || !isValid(row, col + 1) || !isValid(row + 1, col) || !isValid(row + 1, col + 1)) {
        continue;
      }
      const a = row * res + col;
      const b = a + 1;
      const c = a + res;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, min, max, span };
}

const DEFAULT_BOUNDS_SPAN_X = DEFAULT_SURFACE_BOUNDS.xMax - DEFAULT_SURFACE_BOUNDS.xMin;
const DEFAULT_BOUNDS_SPAN_Y = DEFAULT_SURFACE_BOUNDS.yMax - DEFAULT_SURFACE_BOUNDS.yMin;

export interface SurfaceViewTransform {
  scaleX: number;
  scaleZ: number;
  centerX: number;
  centerZ: number;
  toVisualX: (x: number) => number;
  toVisualZ: (y: number) => number;
  toRawX: (visualX: number) => number;
  toRawZ: (visualZ: number) => number;
}

/**
 * Maps the presenter's current view bounds onto a FIXED visual footprint —
 * the same ~20x20 world-space square the original, always-±10 surface used
 * (DESIGN.md §8). This is what actually makes "orders of magnitude smaller
 * or bigger than 10" work in the 3D view: mesh height is already
 * independently normalized to `VISUAL_HEIGHT` regardless of the loss
 * function's raw magnitude (see `buildGeometryFromGrid`), but X/Z were not
 * — a ±0.001 window would otherwise render actual-scale vertices, giving a
 * mesh so laterally tiny next to its own (always ~4-unit) height that nothing
 * useful is visible, while a ±10,000 window would blow past the camera's
 * far plane. Normalizing X/Z the same way height already is means the
 * camera, axes/grid helpers, and drag-catch plane never need to change at
 * all — they stay at their original fixed values, and every position that
 * feeds a Three.js `position`/point (mesh vertices, the start-point marker,
 * trajectories, the update arrow) is mapped through this SAME transform so
 * everything stays aligned. An off-center window (e.g. `xMin: 0, xMax: 20`)
 * is centered before scaling, so it's the WINDOW's center that lands at the
 * visual origin, not literal (0,0).
 */
export function surfaceViewTransformFor(bounds: GridBounds): SurfaceViewTransform {
  const scaleX = DEFAULT_BOUNDS_SPAN_X / (bounds.xMax - bounds.xMin);
  const scaleZ = DEFAULT_BOUNDS_SPAN_Y / (bounds.yMax - bounds.yMin);
  const centerX = (bounds.xMin + bounds.xMax) / 2;
  const centerZ = (bounds.yMin + bounds.yMax) / 2;
  return {
    scaleX,
    scaleZ,
    centerX,
    centerZ,
    toVisualX: (x) => (x - centerX) * scaleX,
    toVisualZ: (y) => (y - centerZ) * scaleZ,
    toRawX: (visualX) => visualX / scaleX + centerX,
    toRawZ: (visualZ) => visualZ / scaleZ + centerZ,
  };
}

/**
 * Surface mode's loss-function surface: samples `ast` over `bounds` (the
 * presenter's current view, defaulting to `DEFAULT_SURFACE_BOUNDS`) at
 * `SURFACE_RESOLUTION`, then maps the sampled x/y coordinates through
 * `surfaceViewTransformFor` before building the mesh — the returned
 * geometry's X/Z are always in the same fixed VISUAL footprint regardless
 * of how large or small `bounds` actually is (see that function's doc
 * comment). At the default ±10 bounds this transform is the identity, so
 * existing callers/tests that don't pass `bounds` see no change at all.
 */
export function buildSurfaceGeometry(ast: ExprNode, bounds: GridBounds = DEFAULT_SURFACE_BOUNDS): SurfaceGeometryResult {
  return buildGeometryInView(computeLossGrid(ast, bounds, SURFACE_RESOLUTION), surfaceViewTransformFor(bounds));
}

/** Builds a mesh from a grid sampled in raw parameter space, with X/Z mapped through `transform` into the fixed visual footprint (see `surfaceViewTransformFor`). Used by both surface and dataset mode. */
export function buildGeometryInView(grid: Pick<LossGrid, "resolution" | "xs" | "ys" | "values">, transform: SurfaceViewTransform): SurfaceGeometryResult {
  return buildGeometryFromGrid({ ...grid, xs: Float64Array.from(grid.xs, transform.toVisualX), ys: Float64Array.from(grid.ys, transform.toVisualZ) });
}

/** Normalizes a raw loss value to the same visual height scale as the surface mesh, for markers that must sit exactly on it. */
export function normalizeHeight(loss: number, min: number, span: number): number {
  return Number.isFinite(loss) ? ((loss - min) / span) * VISUAL_HEIGHT : 0;
}
