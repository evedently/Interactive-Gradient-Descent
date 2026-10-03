import { contours as d3contours } from "d3-contour";
import { colorForLevel } from "../../domain/visualization/contourColor";
import { contourLevels, type CanvasTransform } from "../../domain/visualization/canvasTransform";
import { createMaskedRegionPattern } from "../../domain/visualization/maskedRegionPattern";
import { clamp } from "../../lib/math";

const CONTOUR_THRESHOLD_COUNT = 20;
const BAND_STROKE = "rgba(10,12,16,0.35)";
const MASK_FALLBACK_FILL = "rgba(120,120,120,0.85)";
const UPDATE_LINE_COLOR = "#ffd23f";
const TRAJECTORY_LINE_WIDTH = 2;
const CURRENT_POINT_RADIUS = 6;
const START_MARKER_RADIUS = 7;
const START_MARKER_FILL = "#e8e8e8";
const START_MARKER_STROKE = "#333";

export interface LossGridView {
  /** Row-major, `resolution`×`resolution`; non-finite entries are masked (invalid-domain) cells. */
  values: ArrayLike<number>;
  resolution: number;
  min: number;
  span: number;
}

export interface ContourTrajectory {
  color: string;
  points: readonly { x: number; y: number }[];
  current: { x: number; y: number };
  /** Where the pending update would move `current` to, if it should be drawn. */
  updateTip?: { x: number; y: number };
}

/** Filled contour bands, each outlined so individual level sets read as distinct lines, not just a soft gradient. */
export function drawContourBands(ctx: CanvasRenderingContext2D, grid: LossGridView, size: number): void {
  const { values, resolution, min, span } = grid;
  // Sanitize masked cells to `min` purely for the contour computation, so
  // marching squares doesn't have to deal with NaN; the mask is re-drawn
  // as an explicit gap afterward (DESIGN.md §8).
  const sanitized = Float64Array.from(values, (v) => (Number.isFinite(v) ? v : min));
  const generator = d3contours().size([resolution, resolution]).thresholds(contourLevels(min, span, CONTOUR_THRESHOLD_COUNT));
  const bands = generator(sanitized as unknown as number[]);
  const scale = size / resolution;

  for (const band of bands) {
    const t = span > 0 ? (band.value - min) / span : 0;
    ctx.fillStyle = colorForLevel(clamp(t, 0, 1));
    ctx.beginPath();
    for (const polygon of band.coordinates) {
      for (const ring of polygon) {
        ring.forEach(([gx, gy], i) => {
          const px = gx * scale;
          const py = size - gy * scale; // flip vertically
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      }
    }
    ctx.fill();
    ctx.strokeStyle = BAND_STROKE;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Masked (invalid-domain) cells as a diagonal hatch — visibly distinct from both a contour band and the unpainted background. */
export function drawMaskedCells(ctx: CanvasRenderingContext2D, grid: LossGridView, size: number): void {
  const { values, resolution } = grid;
  ctx.fillStyle = createMaskedRegionPattern(ctx) ?? MASK_FALLBACK_FILL;
  const cell = size / (resolution - 1);
  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      if (Number.isFinite(values[row * resolution + col])) continue;
      ctx.fillRect(col * cell - cell / 2, size - row * cell - cell / 2, cell, cell);
    }
  }
}

/** One rule's path, current point, and (optionally) pending update vector, in its own color. */
export function drawTrajectory(ctx: CanvasRenderingContext2D, trajectory: ContourTrajectory, transform: CanvasTransform): void {
  ctx.strokeStyle = trajectory.color;
  ctx.lineWidth = TRAJECTORY_LINE_WIDTH;
  ctx.beginPath();
  trajectory.points.forEach((p, i) => {
    const { px, py } = transform.toCanvas(p.x, p.y);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  const cur = transform.toCanvas(trajectory.current.x, trajectory.current.y);
  ctx.fillStyle = trajectory.color;
  ctx.beginPath();
  ctx.arc(cur.px, cur.py, CURRENT_POINT_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  if (trajectory.updateTip) {
    const tip = transform.toCanvas(trajectory.updateTip.x, trajectory.updateTip.y);
    ctx.strokeStyle = UPDATE_LINE_COLOR;
    ctx.lineWidth = TRAJECTORY_LINE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(cur.px, cur.py);
    ctx.lineTo(tip.px, tip.py);
    ctx.stroke();
  }
}

/** The shared, draggable start-point / initial-values marker. */
export function drawStartMarker(ctx: CanvasRenderingContext2D, point: { x: number; y: number }, transform: CanvasTransform): void {
  const { px, py } = transform.toCanvas(point.x, point.y);
  ctx.fillStyle = START_MARKER_FILL;
  ctx.strokeStyle = START_MARKER_STROKE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, START_MARKER_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}
