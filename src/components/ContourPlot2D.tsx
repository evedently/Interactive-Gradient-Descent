import { contours as d3contours } from "d3-contour";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { colorForLevel } from "../domain/visualization/contourColor";
import { decimateForDisplay, MAX_RENDERED_TRAJECTORY_POINTS } from "../domain/visualization/decimate";
import { computeLossGrid, type GridBounds, finiteRange } from "../domain/visualization/grid";
import { createMaskedRegionPattern } from "../domain/visualization/maskedRegionPattern";
import type { RuleRunnerEntry } from "./Surface3D";
import { useRunnersVersion } from "../hooks/useRunnersVersion";
import { useWorkspaceStore } from "../state/workspaceStore";

const RESOLUTION = 60;
const CANVAS_SIZE = 440;
const MARKER_HIT_RADIUS_PX = 14;

function lossToCanvas(x: number, y: number, bounds: GridBounds): { px: number; py: number } {
  const px = ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * CANVAS_SIZE;
  // Canvas Y grows downward; flip so larger loss-y is drawn higher up.
  const py = CANVAS_SIZE - ((y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * CANVAS_SIZE;
  return { px, py };
}

function canvasToLoss(px: number, py: number, bounds: GridBounds): { x: number; y: number } {
  const x = bounds.xMin + (px / CANVAS_SIZE) * (bounds.xMax - bounds.xMin);
  const y = bounds.yMin + (1 - py / CANVAS_SIZE) * (bounds.yMax - bounds.yMin);
  return { x, y };
}

interface Props {
  entries: RuleRunnerEntry[];
}

export function ContourPlot2D({ entries }: Props) {
  const activeLossAst = useWorkspaceStore((s) => s.activeLoss.ast);
  const startPoint = useWorkspaceStore((s) => s.startPoint);
  const setStartPoint = useWorkspaceStore((s) => s.setStartPoint);
  const bounds = useWorkspaceStore((s) => s.surfaceBounds);

  useRunnersVersion(entries.map((e) => e.runner));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);

  const grid = useMemo(() => computeLossGrid(activeLossAst, bounds, RESOLUTION), [activeLossAst, bounds]);
  const { min, max } = useMemo(() => finiteRange(grid.values), [grid]);
  const span = max - min || 1;

  const markerPoint = dragPreview ?? startPoint;
  const visibleEntries = entries.filter((e) => e.rule.visible);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Sanitize masked cells to `min` purely for the contour computation, so
    // marching squares doesn't have to deal with NaN; the mask is re-drawn
    // as an explicit gap afterward (DESIGN.md §8).
    const sanitized = Float64Array.from(grid.values, (v) => (Number.isFinite(v) ? v : min));
    const thresholds = 20;
    const step = span / thresholds;
    const levels = Array.from({ length: thresholds }, (_, i) => min + i * step);
    const generator = d3contours().size([RESOLUTION, RESOLUTION]).thresholds(levels);
    const bands = generator(sanitized as unknown as number[]);

    const scaleX = CANVAS_SIZE / RESOLUTION;
    const scaleY = CANVAS_SIZE / RESOLUTION;

    for (const band of bands) {
      const t = span > 0 ? (band.value - min) / span : 0;
      ctx.fillStyle = colorForLevel(Math.min(1, Math.max(0, t)));
      ctx.beginPath();
      for (const polygon of band.coordinates) {
        for (const ring of polygon) {
          ring.forEach(([gx, gy], i) => {
            const px = gx * scaleX;
            const py = CANVAS_SIZE - gy * scaleY; // flip vertically
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
        }
      }
      ctx.fill();
      // A thin dark stroke on each band's boundary makes individual level
      // sets visible as distinct lines, not just a soft color gradient —
      // especially important with the ramp's blue/green stops, which sit
      // closer in perceived brightness than blue/yellow did.
      ctx.strokeStyle = "rgba(10,12,16,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Masked (invalid-domain) cells: a diagonal hatch, not a flat color —
    // visibly distinct from both a contour band and the canvas's own
    // (unpainted) background outside the plotted bounds.
    ctx.fillStyle = createMaskedRegionPattern(ctx) ?? "rgba(120,120,120,0.85)";
    const cellW = CANVAS_SIZE / (RESOLUTION - 1);
    const cellH = CANVAS_SIZE / (RESOLUTION - 1);
    for (let row = 0; row < RESOLUTION; row++) {
      for (let col = 0; col < RESOLUTION; col++) {
        if (Number.isFinite(grid.values[row * RESOLUTION + col])) continue;
        const px = col * cellW - cellW / 2;
        const py = CANVAS_SIZE - row * cellH - cellH / 2;
        ctx.fillRect(px, py, cellW, cellH);
      }
    }

    // Each visible rule's trajectory, current point, and pending update vector, in its own color.
    for (const { rule, runner } of visibleEntries) {
      const current = runner.current;

      ctx.strokeStyle = rule.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      decimateForDisplay(runner.trajectory, MAX_RENDERED_TRAJECTORY_POINTS).forEach((p, i) => {
        const { px, py } = lossToCanvas(p.x, p.y, bounds);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      const cur = lossToCanvas(current.x, current.y, bounds);
      ctx.fillStyle = rule.color;
      ctx.beginPath();
      ctx.arc(cur.px, cur.py, 6, 0, Math.PI * 2);
      ctx.fill();

      const peek = runner.peekUpdate();
      if (peek.ok) {
        const tip = lossToCanvas(current.x + peek.dx, current.y + peek.dy, bounds);
        ctx.strokeStyle = "#ffd23f";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cur.px, cur.py);
        ctx.lineTo(tip.px, tip.py);
        ctx.stroke();
      }
    }

    // Start-point marker (draggable, shared).
    const mk = lossToCanvas(markerPoint.x, markerPoint.y, bounds);
    ctx.fillStyle = "#e8e8e8";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mk.px, mk.py, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, [grid, min, max, span, visibleEntries, markerPoint, bounds]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const mk = lossToCanvas(startPoint.x, startPoint.y, bounds);
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
    const { x, y } = canvasToLoss(Math.min(CANVAS_SIZE, Math.max(0, px)), Math.min(CANVAS_SIZE, Math.max(0, py)), bounds);
    setDragPreview({ x, y });
  };

  const handlePointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragPreview((preview) => {
      if (preview) setStartPoint(preview);
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
