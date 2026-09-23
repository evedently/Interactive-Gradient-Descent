import type { ExprNode } from "./ast";
import { ExprError } from "./errors";
import { FUNCTION_ARITY } from "./functions";

export type Scope = Readonly<Record<string, number>>;

/**
 * Evaluates an already-parsed expression AST against a scope of bound
 * identifier values. Domain errors (log of a negative number, division by
 * zero, etc.) are NOT thrown here — they produce IEEE-754 `NaN`/`Infinity`
 * per ordinary floating-point semantics, and are handled by the caller
 * (surface/contour rendering masks them, the simulation runner's guard
 * stops on them — DESIGN.md §8 vs §17). Only unresolvable identifiers throw,
 * since those are a static/semantic error, not a runtime numeric one.
 */
export function evaluateExpr(node: ExprNode, scope: Scope): number {
  switch (node.type) {
    case "Number":
      return node.value;
    case "Identifier": {
      const value = scope[node.name];
      if (value === undefined) {
        throw new ExprError(`Unknown identifier '${node.name}'`, node.span);
      }
      return value;
    }
    case "Unary":
      return -evaluateExpr(node.operand, scope);
    case "Binary": {
      const left = evaluateExpr(node.left, scope);
      const right = evaluateExpr(node.right, scope);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        case "^":
          return Math.pow(left, right);
      }
      break;
    }
    case "Call": {
      const args = node.args.map((a) => evaluateExpr(a, scope));
      return callFunction(node.name, args);
    }
  }
  throw new ExprError("Unreachable expression node", (node as ExprNode).span);
}

function callFunction(name: string, args: number[]): number {
  if (!(name in FUNCTION_ARITY)) {
    // Unreachable for AST produced by parser.ts (which only ever builds a
    // Call node for allowlisted names), kept as a defensive check for any
    // AST constructed by other means (e.g. future symbolic-diff output).
    throw new Error(`Unknown function '${name}'`);
  }
  switch (name) {
    case "sqrt":
      return Math.sqrt(args[0]);
    case "abs":
      return Math.abs(args[0]);
    case "sin":
      return Math.sin(args[0]);
    case "cos":
      return Math.cos(args[0]);
    case "tan":
      return Math.tan(args[0]);
    case "ln":
      return Math.log(args[0]);
    case "log":
      // log(x, base) = ln(x) / ln(base) — args[1] non-positive or 1 yields
      // NaN/Infinity via ordinary IEEE-754 semantics, same as every other
      // domain violation in this evaluator.
      return Math.log(args[0]) / Math.log(args[1]);
    case "exp":
      return Math.exp(args[0]);
    case "min":
      return Math.min(args[0], args[1]);
    case "max":
      return Math.max(args[0], args[1]);
    default:
      throw new Error(`Function '${name}' has no evaluator implementation`);
  }
}
