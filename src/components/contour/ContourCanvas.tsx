import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { Steppable } from "../../domain/simulation/RunnerInterfaces";
import { canvasTransform } from "../../domain/visualization/canvasTransform";
import type { GridBounds } from "../../domain/visualization/grid";
import { drawContourBands, drawMaskedCells, drawStartMarker, drawTrajectory, type ContourTrajectory, type LossGridView } from "./drawContour";

const CANVAS_SIZE = 440;
const MARKER_HIT_RADIUS_PX = 14;

type Point = { x: number; y: number };

interface Props {
  grid: LossGridView;
  bounds: GridBounds;
  trajectories: readonly ContourTrajectory[];
  /** The committed start-point / initial-values marker position. */
  marker: Point;
  /** Runners paused when a marker drag begins (DESIGN.md §9). */
  runners: readonly Steppable[];
  onMarkerCommit: (point: Point) => void;
}

/**
 * The 2D contour view shared by surface and dataset mode: filled bands,
 * hatched masked cells, every visible rule's trajectory, and a draggable
 * start marker. Dragging pauses every running rule and previews locally;
 * release commits through `onMarkerCommit` — never touching any rule's
 * live trajectory (only its next Reset seeds from it).
 */
export function ContourCanvas({ grid, bounds, trajectories, marker, runners, onMarkerCommit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const [dragPreview, setDragPreview] = useState<Point | null>(null);
  const transform = canvasTransform(bounds, CANVAS_SIZE);
  const markerPoint = dragPreview ?? marker;

  // Redrawn on every render: the parent re-renders whenever any runner steps.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawContourBands(ctx, grid, CANVAS_SIZE);
    drawMaskedCells(ctx, grid, CANVAS_SIZE);
    for (const trajectory of trajectories) drawTrajectory(ctx, trajectory, transform);
    drawStartMarker(ctx, markerPoint, transform);
  });

  const pointerPosition = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { px, py } = pointerPosition(e);
    const mk = transform.toCanvas(marker.x, marker.y);
    if (Math.hypot(px - mk.px, py - mk.py) > MARKER_HIT_RADIUS_PX) return;
    draggingRef.current = true;
    for (const runner of runners) {
      if (runner.status === "running") runner.pause();
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    const { px, py } = pointerPosition(e);
    setDragPreview(transform.fromCanvas(px, py));
  };

  const handlePointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragPreview((preview) => {
      if (preview) onMarkerCommit(preview);
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
