/**
 * Decimation for long runs (DESIGN.md §18 Phase 9 hardening): thins a long
 * trajectory down to at most `maxPoints` evenly-spaced points for RENDERING
 * only. This never touches `SimulationRunner`/`DatasetSimulationRunner`'s
 * own `trajectory` array — CSV export and reproducibility tests still read
 * the full, undecimated history — it's purely a performance seam the 3D/2D
 * trajectory-drawing components call on their way to the screen, so a
 * multi-hour run with hundreds of thousands of points doesn't hand a WebGL
 * line or a canvas polyline more vertices than a frame budget allows.
 */
export function decimateForDisplay<T>(points: readonly T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return [...points];
  if (maxPoints <= 1) return [points[points.length - 1]];

  const result: T[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.round(i * step)]);
  }
  return result;
}

/** Cap used by every trajectory-rendering call site (Surface3D/ContourPlot2D and their dataset-mode counterparts) — generous enough that decimation is invisible at normal run lengths, small enough to keep the render fast at Phase 9's "several concurrent long-running rules" scale. */
export const MAX_RENDERED_TRAJECTORY_POINTS = 2000;
