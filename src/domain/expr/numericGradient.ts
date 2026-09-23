/**
 * Central-difference numerical differentiation — Phase 1's only
 * differentiation strategy (symbolic differentiation is Phase 5,
 * DESIGN.md §5). `h` defaults to a value that balances truncation error
 * against floating-point cancellation error for typical loss-surface
 * magnitudes.
 */
export function numericGradient2D(
  f: (x: number, y: number) => number,
  x: number,
  y: number,
  h = 1e-4,
): { gx: number; gy: number } {
  const gx = (f(x + h, y) - f(x - h, y)) / (2 * h);
  const gy = (f(x, y + h) - f(x, y - h)) / (2 * h);
  return { gx, gy };
}

/**
 * Generalizes `numericGradient2D` to an arbitrary named set of variables
 * (DESIGN.md §4/§7's primary-variable list, Phase 7's per-example-loss
 * gradient) — same central-difference approach, one entry per name.
 */
export function numericGradientN(
  f: (coords: Readonly<Record<string, number>>) => number,
  coords: Readonly<Record<string, number>>,
  names: readonly string[],
  h = 1e-4,
): Record<string, number> {
  const gradient: Record<string, number> = {};
  for (const name of names) {
    const plus = { ...coords, [name]: coords[name] + h };
    const minus = { ...coords, [name]: coords[name] - h };
    gradient[name] = (f(plus) - f(minus)) / (2 * h);
  }
  return gradient;
}
