import { contours as d3contours } from "d3-contour";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { DatasetLossGrid } from "../domain/dataset/datasetLossGrid";
import type { PrimaryVariable } from "../domain/rules/ruleCompiler";
import { colorForLevel } from "../domain/visualization/contourColor";
import { decimateForDisplay, MAX_RENDERED_TRAJECTORY_POINTS } from "../domain/visualization/decimate";
import { finiteRange } from "../domain/visualization/grid";
import { createMaskedRegionPattern } from "../domain/visualization/maskedRegionPattern";
import { useRunnersVersion } from "../hooks/useRunnersVersion";
import { useWorkspaceStore } from "../state/workspaceStore";
import type { DatasetRuleRunnerEntry } from "./MetricCharts";

const CANVAS_SIZE = 440;
const MARKER_HIT_RADIUS_PX = 14;

interface Props {
  entries: DatasetRuleRunnerEntry[];
  grid: DatasetLossGrid;
  primaryVariables: readonly PrimaryVariable[];
  initialValues: Readonly<Record<string, number>>;
}

/**
 * Dataset mode's counterpart to `ContourPlot2D` (DESIGN.md §18 Phase 7
 * extension), synchronized with `DatasetSurface3D` — same grid, same
 * bounds, same trajectories. The initial-values marker is draggable here
 * too, same as `DatasetSurface3D`'s (see its doc comment for why) — the
 * two views are kept in lockstep by both reading/writing the same
 * `datasetInitialValues` store field, never their own local copy.
 */
export function DatasetContourPlot2D({ entries, grid, primaryVariables, initialValues }: Props) {
  useRunnersVersion(entries.map((e) => e.runner));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const [dragPreview, setDragPreview] = useState<{ a: number; b: number } | null>(null);
  const [aName, bName] = primaryVariables.map((v) => v.name);
  const setDatasetInitialValues = useWorkspaceStore((s) => s.setDatasetInitialValues);
  const visibleEntries = entries.filter((e) => e.rule.visible);

  const bounds = grid.bounds;
  const toCanvas = (x: number, y: number) => ({
    px: ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * CANVAS_SIZE,
    py: CANVAS_SIZE - ((y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * CANVAS_SIZE,
  });
  const fromCanvas = (px: number, py: number) => ({
    a: bounds.xMin + (px / CANVAS_SIZE) * (bounds.xMax - bounds.xMin),
    b: bounds.yMin + (1 - py / CANVAS_SIZE) * (bounds.yMax - bounds.yMin),
  });

  const markerPoint = dragPreview ?? { a: initialValues[aName] ?? 0, b: initialValues[bName] ?? 0 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { min, max } = finiteRange(grid.values);
    const span = max - min || 1;
    const resolution = grid.resolution;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const sanitized = Float64Array.from(grid.values, (v) => (Number.isFinite(v) ? v : min));
    const thresholds = 20;
    const step = span / thresholds;
    const levels = Array.from({ length: thresholds }, (_, i) => min + i * step);
    const generator = d3contours().size([resolution, resolution]).thresholds(levels);
    const bands = generator(sanitized as unknown as number[]);

    const scaleX = CANVAS_SIZE / resolution;
    const scaleY = CANVAS_SIZE / resolution;

    for (const band of bands) {
      const t = span > 0 ? (band.value - min) / span : 0;
      ctx.fillStyle = colorForLevel(Math.min(1, Math.max(0, t)));
      ctx.beginPath();
      for (const polygon of band.coordinates) {
        for (const ring of polygon) {
          ring.forEach(([gx, gy], i) => {
            const px = gx * scaleX;
            const py = CANVAS_SIZE - gy * scaleY;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
        }
      }
      ctx.fill();
      ctx.strokeStyle = "rgba(10,12,16,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Masked (invalid-domain) cells: a diagonal hatch, not a flat color —
    // same treatment as ContourPlot2D (DESIGN.md §8's rendering polish).
    ctx.fillStyle = createMaskedRegionPattern(ctx) ?? "rgba(120,120,120,0.85)";
    const cellW = CANVAS_SIZE / (resolution - 1);
    const cellH = CANVAS_SIZE / (resolution - 1);
    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        if (Number.isFinite(grid.values[row * resolution + col])) continue;
        const px = col * cellW - cellW / 2;
        const py = CANVAS_SIZE - row * cellH - cellH / 2;
        ctx.fillRect(px, py, cellW, cellH);
      }
    }

    for (const { rule, runner } of visibleEntries) {
      ctx.strokeStyle = rule.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      decimateForDisplay(runner.trajectory, MAX_RENDERED_TRAJECTORY_POINTS).forEach((p, i) => {
        const { px, py } = toCanvas(p.coords[aName], p.coords[bName]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      const current = runner.current;
      const cur = toCanvas(current.coords[aName], current.coords[bName]);
      ctx.fillStyle = rule.color;
      ctx.beginPath();
      ctx.arc(cur.px, cur.py, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Initial-values marker (draggable, shared).
    const mk = toCanvas(markerPoint.a, markerPoint.b);
    ctx.fillStyle = "#e8e8e8";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mk.px, mk.py, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, visibleEntries, aName, bName, markerPoint.a, markerPoint.b]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const mk = toCanvas(initialValues[aName] ?? 0, initialValues[bName] ?? 0);
    if (Math.hypot(px - mk.px, py - mk.py) <= MARKER_HIT_RADIUS_PX) {
      draggingRef.current = true;
      for (const { runner } of entries) {
        if (runner.status === "running") runner.pause();
      }
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setDragPreview(fromCanvas(Math.min(CANVAS_SIZE, Math.max(0, px)), Math.min(CANVAS_SIZE, Math.max(0, py))));
  };

  const handlePointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragPreview((preview) => {
      if (preview) setDatasetInitialValues({ [aName]: preview.a, [bName]: preview.b });
      return null;
    });
  };

  return (
    <div className="contour-container">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
}
