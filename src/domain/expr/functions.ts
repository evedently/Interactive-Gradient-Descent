/**
 * The function allowlist for the expression grammar (DESIGN.md §3a/§3c).
 * Extending this object (plus `evaluate.ts`'s `callFunction` and
 * `toLatex.ts`'s rendering) is how the grammar grows — Phase 1 started with
 * just `sqrt`/`abs`; Phase 3 added `sin`/`cos`/`tan`/`ln`/`log`; Phase 5
 * adds `exp`/`min`/`max` to complete the set the differentiation table
 * (DESIGN.md §5) and its documented nonsmooth exceptions are written
 * against.
 *
 * `log` is always binary — `log(x, base)` computes log base `base` of `x` —
 * there is no implicit-base single-argument form, so a bare `log(x)` is a
 * clear arity error rather than an ambiguous "which base did you mean".
 * Natural log is the separate unary `ln(x)`. `min`/`max` are binary; an
 * n-ary form is a straightforward future extension, not built now.
 */
export const FUNCTION_ARITY: Record<string, number> = {
  sqrt: 1,
  abs: 1,
  sin: 1,
  cos: 1,
  tan: 1,
  exp: 1,
  ln: 1,
  log: 2,
  min: 2,
  max: 2,
};

/**
 * Functions with no symbolic derivative rule (DESIGN.md §5): an expression
 * containing any of these is differentiated *entirely* numerically rather
 * than mixing symbolic and numeric pieces — see `differentiate.ts`.
 */
export const NONSMOOTH_FUNCTIONS: ReadonlySet<string> = new Set(["abs", "min", "max"]);

/**
 * Functions whose domain is restricted (DESIGN.md §5's "may be undefined
 * for some inputs" warning) even though they ARE symbolically
 * differentiable — see `differentiability.ts`.
 */
export const DOMAIN_RISK_FUNCTIONS: ReadonlySet<string> = new Set(["sqrt", "ln", "log", "tan"]);

export function isKnownFunction(name: string): boolean {
  return name in FUNCTION_ARITY;
}
