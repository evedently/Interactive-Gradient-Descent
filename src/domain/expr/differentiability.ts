import type { ExprNode } from "./ast";
import { DOMAIN_RISK_FUNCTIONS, NONSMOOTH_FUNCTIONS } from "./functions";

export interface DifferentiabilityWarnings {
  /** "This function may be nondifferentiable." — abs/min/max anywhere in the tree (DESIGN.md §5). */
  mayBeNondifferentiable: boolean;
  /** "This function may be undefined for some inputs." — an unguarded sqrt/ln/log/tan/division (DESIGN.md §5). */
  mayBeUndefinedForSomeInputs: boolean;
}

function isNonZeroConstant(node: ExprNode): boolean {
  return node.type === "Number" && node.value !== 0;
}

function isPositiveConstant(node: ExprNode): boolean {
  return node.type === "Number" && node.value > 0;
}

/**
 * A conservative, purely syntactic scan for two independent warnings
 * (DESIGN.md §5, decision 2). Deliberately simple: it flags a division
 * unless the denominator is a literal nonzero number, and flags
 * sqrt/ln/log's argument unless it's a literal positive number — no
 * interval or sign analysis of larger sub-expressions (e.g. `x^2 + 1` is
 * flagged even though it's always positive). Over-warning is an accepted
 * trade-off, not a bug to fix later.
 */
export function analyzeDifferentiability(node: ExprNode): DifferentiabilityWarnings {
  let mayBeNondifferentiable = false;
  let mayBeUndefinedForSomeInputs = false;

  function visit(n: ExprNode): void {
    switch (n.type) {
      case "Number":
      case "Identifier":
        return;
      case "Unary":
        visit(n.operand);
        return;
      case "Binary":
        if (n.op === "/" && !isNonZeroConstant(n.right)) {
          mayBeUndefinedForSomeInputs = true;
        }
        visit(n.left);
        visit(n.right);
        return;
      case "Call":
        if (NONSMOOTH_FUNCTIONS.has(n.name)) {
          mayBeNondifferentiable = true;
        }
        if (DOMAIN_RISK_FUNCTIONS.has(n.name)) {
          // tan's risk is its asymptotes, not its argument's sign — always flag.
          // sqrt/ln/log's risk IS the argument's sign — exempt an obviously-safe literal.
          if (n.name === "tan" || !isPositiveConstant(n.args[0])) {
            mayBeUndefinedForSomeInputs = true;
          }
        }
        n.args.forEach(visit);
        return;
    }
  }

  visit(node);
  return { mayBeNondifferentiable, mayBeUndefinedForSomeInputs };
}

/** True if `node` contains no nonsmooth function anywhere (DESIGN.md §5: the whole gradient falls back to numeric otherwise). */
export function isFullySmooth(node: ExprNode): boolean {
  let smooth = true;
  function visit(n: ExprNode): void {
    if (!smooth) return;
    switch (n.type) {
      case "Number":
      case "Identifier":
        return;
      case "Unary":
        visit(n.operand);
        return;
      case "Binary":
        visit(n.left);
        visit(n.right);
        return;
      case "Call":
        if (NONSMOOTH_FUNCTIONS.has(n.name)) {
          smooth = false;
          return;
        }
        n.args.forEach(visit);
        return;
    }
  }
  visit(node);
  return smooth;
}
