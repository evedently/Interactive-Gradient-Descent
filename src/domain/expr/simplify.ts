import type { ExprNode, Span } from "./ast";

const ZERO_SPAN: Span = { start: 0, end: 0 };

function num(value: number): ExprNode {
  return { type: "Number", value, span: ZERO_SPAN };
}

function isNum(node: ExprNode, value?: number): boolean {
  return node.type === "Number" && (value === undefined || node.value === value);
}

function bin(op: "+" | "-" | "*" | "/" | "^", left: ExprNode, right: ExprNode): ExprNode {
  return { type: "Binary", op, left, right, span: ZERO_SPAN };
}

/**
 * A bounded algebraic simplifier for symbolic-differentiation output
 * (DESIGN.md §5) — constant folding, the handful of identities (`x+0`,
 * `x*1`, `x*0`, `x^1`, `x^0`, double negation), and one level of constant
 * re-association (`4*(2*u)` -> `8*u`, the shape the product/chain rules
 * actually produce). This is not a general CAS: it does one bottom-up
 * pass and does not, for example, collect like terms across a whole sum.
 * Good enough for the polynomial-ish expressions a loss function
 * realistically is; anything it can't simplify is still a *correct*,
 * just less tidy, expression.
 */
export function simplify(node: ExprNode): ExprNode {
  switch (node.type) {
    case "Number":
    case "Identifier":
      return node;

    case "Unary": {
      const operand = simplify(node.operand);
      if (operand.type === "Number") return num(-operand.value);
      if (operand.type === "Unary") return operand.operand; // -(-u) = u
      return { ...node, operand };
    }

    case "Call":
      return { ...node, args: node.args.map(simplify) };

    case "Binary": {
      const left = simplify(node.left);
      const right = simplify(node.right);

      if (left.type === "Number" && right.type === "Number") {
        switch (node.op) {
          case "+":
            return num(left.value + right.value);
          case "-":
            return num(left.value - right.value);
          case "*":
            return num(left.value * right.value);
          case "/":
            return num(left.value / right.value);
          case "^":
            return num(Math.pow(left.value, right.value));
        }
      }

      switch (node.op) {
        case "+":
          if (isNum(left, 0)) return right;
          if (isNum(right, 0)) return left;
          break;
        case "-":
          if (isNum(right, 0)) return left;
          if (isNum(left, 0)) return simplify({ type: "Unary", op: "-", operand: right, span: ZERO_SPAN });
          break;
        case "*":
          if (isNum(left, 0) || isNum(right, 0)) return num(0);
          if (isNum(left, 1)) return right;
          if (isNum(right, 1)) return left;
          // Associativity for a nested constant factor, e.g. the product
          // rule's `4 * (2 * (y+1))` collapsing to `8 * (y+1)`: one level
          // of re-association is enough for the shapes differentiation
          // actually produces (a single constant coefficient nested one
          // level deep), without turning this into a general CAS.
          if (left.type === "Number" && right.type === "Binary" && right.op === "*") {
            if (right.left.type === "Number") return simplify(bin("*", num(left.value * right.left.value), right.right));
            if (right.right.type === "Number") return simplify(bin("*", num(left.value * right.right.value), right.left));
          }
          if (right.type === "Number" && left.type === "Binary" && left.op === "*") {
            if (left.left.type === "Number") return simplify(bin("*", num(left.left.value * right.value), left.right));
            if (left.right.type === "Number") return simplify(bin("*", num(left.right.value * right.value), left.left));
          }
          break;
        case "/":
          if (isNum(right, 1)) return left;
          if (isNum(left, 0)) return num(0);
          break;
        case "^":
          if (isNum(right, 1)) return left;
          if (isNum(right, 0)) return num(1);
          break;
      }

      return { ...node, left, right };
    }
  }
}
