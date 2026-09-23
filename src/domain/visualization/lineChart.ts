/**
 * Pure scaling math for `MetricCharts`' value-vs-iteration/loss-vs-iteration
 * plots (DESIGN.md §7/§18 Phase 7). Kept separate from the SVG-rendering
 * component so it's unit-testable without a DOM, matching this project's
 * existing split between pure visualization math (`grid.ts`,
 * `surfaceGeometry.ts`) and its React rendering layer.
 */
export interface ValueDomain {
  min: number;
  max: number;
}

/** A degenerate (all-equal or empty) domain gets a small synthetic span so a flat line still renders inside the chart rather than collapsing to a point on an edge. */
export function computeValueDomain(values: readonly number[]): ValueDomain {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    return { min: min - pad, max: max + pad };
  }
  return { min, max };
}

/** Maps a value in `domain` onto `[pixelMin, pixelMax]`, clamped to the domain's ends (a caller may pass an out-of-domain value if it computed the domain over a different set). */
export function scaleToPixels(value: number, domain: ValueDomain, pixelMin: number, pixelMax: number): number {
  const clamped = Math.min(domain.max, Math.max(domain.min, value));
  const t = (clamped - domain.min) / (domain.max - domain.min);
  return pixelMin + t * (pixelMax - pixelMin);
}

/** Builds an SVG `points` attribute value for a value-vs-index polyline. */
export function buildPolylinePoints(values: readonly number[], domain: ValueDomain, width: number, height: number): string {
  if (values.length === 0) return "";
  const lastIndex = Math.max(1, values.length - 1);
  return values
    .map((value, i) => {
      const x = (i / lastIndex) * width;
      // SVG y grows downward; flip so larger values plot higher.
      const y = height - scaleToPixels(value, domain, 0, height);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
