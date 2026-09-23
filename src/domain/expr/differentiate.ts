import type { ExprNode, Span } from "./ast";
import { NONSMOOTH_FUNCTIONS } from "./functions";

const ZERO_SPAN: Span = { start: 0, end: 0 };

function num(value: number): ExprNode {
  return { type: "Number", value, span: ZERO_SPAN };
}
function bin(op: "+" | "-" | "*" | "/" | "^", left: ExprNode, right: ExprNode): ExprNode {
  return { type: "Binary", op, left, right, span: ZERO_SPAN };
}
function neg(operand: ExprNode): ExprNode {
  return { type: "Unary", op: "-", operand, span: ZERO_SPAN };
}
function call(name: string, ...args: ExprNode[]): ExprNode {
  return { type: "Call", name, args, span: ZERO_SPAN };
}

/**
 * Symbolic differentiation with respect to `wrt` (DESIGN.md §5's smooth
 * table: `+ - * /`, unary minus, the power rule — general form when the
 * exponent isn't a literal constant — and the chain rule through
 * `sqrt sin cos tan exp ln`). `log(x, base)` is handled by rewriting it as
 * `ln(x) / ln(base)` and differentiating *that* — the quotient/chain rules
 * already defined here then apply unchanged, including the (unusual, but
 * not disallowed) case where `base` itself depends on `x`/`y`.
 *
 * Must never be called on an expression containing `abs`/`min`/`max` — the
 * caller (`lossFunction.ts`) checks `isFullySmooth` first and uses full
 * numerical differentiation for the whole gradient instead; this function
 * throws if that invariant is violated rather than returning something
 * silently wrong.
 */
export function symbolicDerivative(node: ExprNode, wrt: "x" | "y"): ExprNode {
  switch (node.type) {
    case "Number":
      return num(0);
    case "Identifier":
      return num(node.name === wrt ? 1 : 0);
    case "Unary":
      return neg(symbolicDerivative(node.operand, wrt));
    case "Binary":
      return differentiateBinary(node.op, node.left, node.right, wrt);
    case "Call":
      return differentiateCall(node.name, node.args, wrt);
  }
}

function differentiateBinary(op: "+" | "-" | "*" | "/" | "^", left: ExprNode, right: ExprNode, wrt: "x" | "y"): ExprNode {
  const dl = () => symbolicDerivative(left, wrt);
  const dr = () => symbolicDerivative(right, wrt);

  switch (op) {
    case "+":
      return bin("+", dl(), dr());
    case "-":
      return bin("-", dl(), dr());
    case "*":
      // product rule: (fg)' = f'g + fg'
      return bin("+", bin("*", dl(), right), bin("*", left, dr()));
    case "/":
      // quotient rule: (f/g)' = (f'g - fg') / g^2
      return bin("/", bin("-", bin("*", dl(), right), bin("*", left, dr())), bin("^", right, num(2)));
    case "^":
      if (right.type === "Number") {
        // simple power rule: (f^n)' = n * f^(n-1) * f'
        return bin("*", bin("*", num(right.value), bin("^", left, num(right.value - 1))), dl());
      }
      // generalized power rule (valid for f > 0): (f^g)' = f^g * (g'*ln(f) + g*f'/f)
      return bin("*", bin("^", left, right), bin("+", bin("*", dr(), call("ln", left)), bin("*", right, bin("/", dl(), left))));
  }
}

function differentiateCall(name: string, args: ExprNode[], wrt: "x" | "y"): ExprNode {
  if (NONSMOOTH_FUNCTIONS.has(name)) {
    throw new Error(`symbolicDerivative called on nonsmooth function '${name}' — caller must check isFullySmooth first`);
  }

  const u = args[0];
  const du = () => symbolicDerivative(u, wrt);

  switch (name) {
    case "sqrt":
      // d/dx sqrt(u) = u' / (2*sqrt(u))
      return bin("/", du(), bin("*", num(2), call("sqrt", u)));
    case "sin":
      return bin("*", call("cos", u), du());
    case "cos":
      return neg(bin("*", call("sin", u), du()));
    case "tan":
      // d/dx tan(u) = u' / cos(u)^2
      return bin("/", du(), bin("^", call("cos", u), num(2)));
    case "exp":
      return bin("*", call("exp", u), du());
    case "ln":
      return bin("/", du(), u);
    case "log": {
      // log(u, base) = ln(u) / ln(base) — differentiate the rewritten tree.
      const base = args[1];
      return symbolicDerivative(bin("/", call("ln", u), call("ln", base)), wrt);
    }
    default:
      throw new Error(`symbolicDerivative has no rule for function '${name}'`);
  }
}
