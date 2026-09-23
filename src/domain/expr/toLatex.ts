import type { ExprNode } from "./ast";

const PRECEDENCE: Record<"+" | "-" | "*" | "/" | "^", number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "^": 3,
};
const UNARY_PRECEDENCE = 4;
const ATOMIC_PRECEDENCE = 5;

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toString();
}

function precedenceOf(node: ExprNode): number {
  switch (node.type) {
    case "Binary":
      return PRECEDENCE[node.op];
    case "Unary":
      return UNARY_PRECEDENCE;
    default:
      return ATOMIC_PRECEDENCE;
  }
}

/** Renders `child` for a slot whose surrounding operator has precedence `contextPrec`. */
function renderChild(child: ExprNode, contextPrec: number, needsStrictlyHigher: boolean): string {
  const rendered = render(child);
  const childPrec = precedenceOf(child);
  const mustWrap = needsStrictlyHigher ? childPrec <= contextPrec : childPrec < contextPrec;
  return mustWrap ? `\\left(${rendered}\\right)` : rendered;
}

/** Renders a parsed expression AST back to LaTeX for a read-only preview (DESIGN.md §11). */
export function exprToLatex(node: ExprNode): string {
  return render(node);
}

function render(node: ExprNode): string {
  switch (node.type) {
    case "Number":
      return formatNumber(node.value);
    case "Identifier":
      return node.name;
    case "Unary":
      return `-${renderChild(node.operand, UNARY_PRECEDENCE, false)}`;
    case "Call": {
      const arg = render(node.args[0]);
      if (node.name === "sqrt") return `\\sqrt{${arg}}`;
      if (node.name === "abs") return `\\left|${arg}\\right|`;
      if (node.name === "sin" || node.name === "cos" || node.name === "tan" || node.name === "ln") {
        return `\\${node.name}\\left(${arg}\\right)`;
      }
      if (node.name === "log") {
        const base = render(node.args[1]);
        return `\\log_{${base}}\\left(${arg}\\right)`;
      }
      if (node.name === "exp") return `e^{${arg}}`;
      if (node.name === "min" || node.name === "max") {
        return `\\${node.name}\\left(${arg}, ${render(node.args[1])}\\right)`;
      }
      return `\\operatorname{${node.name}}\\left(${arg}\\right)`;
    }
    case "Binary": {
      if (node.op === "/") {
        return `\\frac{${render(node.left)}}{${render(node.right)}}`;
      }
      if (node.op === "^") {
        // Base is wrapped for anything below atomic precedence (so `(x+1)^2`
        // parenthesizes its base); the exponent never needs parens since
        // LaTeX superscript braces already delimit it.
        const base = renderChild(node.left, ATOMIC_PRECEDENCE, false);
        return `${base}^{${render(node.right)}}`;
      }
      const prec = PRECEDENCE[node.op];
      // Left-associative: the right operand needs strictly-higher
      // precedence to render unparenthesized (a - (b - c) != a - b - c).
      const left = renderChild(node.left, prec, false);
      const right = renderChild(node.right, prec, true);
      const opSymbol = node.op === "*" ? "\\cdot " : ` ${node.op} `;
      return `${left}${opSymbol}${right}`;
    }
  }
}
