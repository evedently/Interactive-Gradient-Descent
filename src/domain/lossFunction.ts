import type { ExprNode } from "./expr/ast";
import { collectIdentifiers } from "./expr/ast";
import { symbolicDerivative } from "./expr/differentiate";
import { analyzeDifferentiability, isFullySmooth } from "./expr/differentiability";
import { ExprError } from "./expr/errors";
import { evaluateExpr } from "./expr/evaluate";
import { numericGradient2D } from "./expr/numericGradient";
import { parseExpression } from "./expr/parser";
import { simplify } from "./expr/simplify";

/** The only two identifiers valid inside a loss-function expression. */
const VALID_LOSS_IDENTIFIERS = new Set(["x", "y"]);

export interface LossFunctionError {
  message: string;
  span: { start: number; end: number };
}

export type GradientMethod = "symbolic" | "numeric" | "manual";

export interface GradientResult {
  gx: number;
  gy: number;
  method: GradientMethod;
}

export interface ManualGradientAst {
  gx: ExprNode;
  gy: ExprNode;
}

/**
 * Everything the simulation/visualization layers need from a successfully
 * parsed loss function, including the Phase 5 differentiation decision
 * (DESIGN.md §5): `symbolicGradient` is `null` whenever the loss contains a
 * nonsmooth function (`abs`/`min`/`max`) anywhere — the whole gradient then
 * falls back to full numerical differentiation rather than mixing symbolic
 * and numeric pieces. `manualGradient` is presenter-supplied separately
 * (not part of parsing the loss text itself) and, when present, wins over
 * both.
 */
export interface ResolvedLoss {
  ast: ExprNode;
  mayBeNondifferentiable: boolean;
  mayBeUndefinedForSomeInputs: boolean;
  symbolicGradient: { gx: ExprNode; gy: ExprNode } | null;
  manualGradient: ManualGradientAst | null;
}

export type LossFunctionParseResult =
  | ({ ok: true; sourceText: string } & Omit<ResolvedLoss, "manualGradient">)
  | { ok: false; sourceText: string; error: LossFunctionError };

/**
 * Parses a loss-function source string (the expression body of `f(x, y) =
 * ...`), validates its identifiers, and resolves the Phase 5 differentiation
 * decision: a symbolic gradient (simplified, for both display and
 * evaluation) when the expression is fully smooth, or `null` — signaling
 * "use numeric" — when it contains `abs`/`min`/`max`. Manual override is
 * layered on separately by the caller (it isn't part of the loss text).
 */
export function parseLossFunction(sourceText: string): LossFunctionParseResult {
  let ast: ExprNode;
  try {
    ast = parseExpression(sourceText);
  } catch (err) {
    if (err instanceof ExprError) {
      return { ok: false, sourceText, error: { message: err.message, span: err.span } };
    }
    throw err;
  }

  for (const ref of collectIdentifiers(ast)) {
    if (!VALID_LOSS_IDENTIFIERS.has(ref.name)) {
      return {
        ok: false,
        sourceText,
        error: { message: `Unknown identifier '${ref.name}' — only 'x' and 'y' are available`, span: ref.span },
      };
    }
  }

  const { mayBeNondifferentiable, mayBeUndefinedForSomeInputs } = analyzeDifferentiability(ast);
  const symbolicGradient = isFullySmooth(ast)
    ? { gx: simplify(symbolicDerivative(ast, "x")), gy: simplify(symbolicDerivative(ast, "y")) }
    : null;

  return { ok: true, sourceText, ast, mayBeNondifferentiable, mayBeUndefinedForSomeInputs, symbolicGradient };
}

/**
 * Parses a presenter-supplied manual gradient override — an ordinary
 * expression over `x`/`y` for each of `gx`/`gy` (DESIGN.md §5). Reuses the
 * same expression grammar and identifier validation as the loss function
 * itself; there is nothing special-cased about a manual gradient's syntax.
 */
export function parseManualGradientComponent(sourceText: string): { ok: true; ast: ExprNode } | { ok: false; error: LossFunctionError } {
  let ast: ExprNode;
  try {
    ast = parseExpression(sourceText);
  } catch (err) {
    if (err instanceof ExprError) {
      return { ok: false, error: { message: err.message, span: err.span } };
    }
    throw err;
  }
  for (const ref of collectIdentifiers(ast)) {
    if (!VALID_LOSS_IDENTIFIERS.has(ref.name)) {
      return { ok: false, error: { message: `Unknown identifier '${ref.name}' — only 'x' and 'y' are available`, span: ref.span } };
    }
  }
  return { ok: true, ast };
}

/** Convenience for callers (mainly tests) that just need a `ResolvedLoss` from a successful parse, with no manual override. */
export function toResolvedLoss(parsed: Omit<ResolvedLoss, "manualGradient">): ResolvedLoss {
  return { ...parsed, manualGradient: null };
}

export function evaluateLoss(ast: ExprNode, x: number, y: number): number {
  return evaluateExpr(ast, { x, y });
}

export function lossNumericGradient(ast: ExprNode, x: number, y: number): { gx: number; gy: number } {
  return numericGradient2D((px, py) => evaluateLoss(ast, px, py), x, y);
}

/**
 * The single entry point the simulation runner and UI use to get a
 * gradient at a point — manual override wins, then symbolic, then numeric
 * (DESIGN.md §5). Callers never need to know which method was used to get
 * a correct value, but `method` is returned for display (§7's "using
 * custom gradient" / differentiation-method indicators).
 */
export function computeLossGradient(loss: ResolvedLoss, x: number, y: number): GradientResult {
  if (loss.manualGradient) {
    return {
      gx: evaluateExpr(loss.manualGradient.gx, { x, y }),
      gy: evaluateExpr(loss.manualGradient.gy, { x, y }),
      method: "manual",
    };
  }
  if (loss.symbolicGradient) {
    return {
      gx: evaluateExpr(loss.symbolicGradient.gx, { x, y }),
      gy: evaluateExpr(loss.symbolicGradient.gy, { x, y }),
      method: "symbolic",
    };
  }
  const { gx, gy } = lossNumericGradient(loss.ast, x, y);
  return { gx, gy, method: "numeric" };
}
