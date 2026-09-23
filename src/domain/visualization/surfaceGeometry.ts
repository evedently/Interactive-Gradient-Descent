import * as THREE from "three";
import type { ExprNode } from "../expr/ast";
import { colorForLevelNormalized } from "./contourColor";
import { computeLossGrid, finiteRange, type GridBounds, type LossGrid } from "./grid";

export const SURFACE_BOUNDS: GridBounds = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
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

/** Surface mode's loss-function surface: samples `ast` over the fixed `SURFACE_BOUNDS`/`SURFACE_RESOLUTION` and builds its mesh. */
export function buildSurfaceGeometry(ast: ExprNode): SurfaceGeometryResult {
  const grid = computeLossGrid(ast, SURFACE_BOUNDS, SURFACE_RESOLUTION);
  return buildGeometryFromGrid(grid);
}

/** Normalizes a raw loss value to the same visual height scale as the surface mesh, for markers that must sit exactly on it. */
export function normalizeHeight(loss: number, min: number, span: number): number {
  return Number.isFinite(loss) ? ((loss - min) / span) * VISUAL_HEIGHT : 0;
}
