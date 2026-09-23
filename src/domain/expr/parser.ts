import type { ExprNode, Span } from "./ast";
import { ExprError } from "./errors";
import { FUNCTION_ARITY, isKnownFunction } from "./functions";
import { tokenize, type Token } from "./tokenizer";

/**
 * Recursive-descent parser for the loss-function expression grammar
 * (DESIGN.md §3a): numbers, `+ - * / ^`, unary minus, parentheses,
 * identifiers, calls to the allowlisted functions in `functions.ts`, and
 * implicit multiplication (`4(y+1)^2`, `x(y+1)`).
 *
 * Grammar (precedence low to high): expr -> term -> unary -> power -> atom.
 * Implicit multiplication is handled in `parseTerm`: after a factor, an
 * immediately-following identifier or `(` (but never a bare number, which
 * would make "2 3" silently valid) is treated as `*`.
 */
class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(source: string) {
    this.tokens = tokenize(source);
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }

  private expect(type: Token["type"]): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new ExprError(`Expected '${type}' but found '${t.text || "end of expression"}'`, t.span);
    }
    return this.advance();
  }

  parseProgram(): ExprNode {
    const node = this.parseExpr();
    const trailing = this.peek();
    if (trailing.type !== "eof") {
      throw new ExprError(`Unexpected '${trailing.text}'`, trailing.span);
    }
    return node;
  }

  private parseExpr(): ExprNode {
    let left = this.parseTerm();
    while (this.peek().type === "+" || this.peek().type === "-") {
      const opTok = this.advance();
      const right = this.parseTerm();
      left = {
        type: "Binary",
        op: opTok.type as "+" | "-",
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      };
    }
    return left;
  }

  private startsFactor(): boolean {
    const t = this.peek().type;
    return t === "identifier" || t === "(";
  }

  private parseTerm(): ExprNode {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type === "*" || t.type === "/") {
        this.advance();
        const right = this.parseUnary();
        left = { type: "Binary", op: t.type, left, right, span: { start: left.span.start, end: right.span.end } };
        continue;
      }
      if (this.startsFactor()) {
        // implicit multiplication: no operator token consumed
        const right = this.parseUnary();
        left = { type: "Binary", op: "*", left, right, span: { start: left.span.start, end: right.span.end } };
        continue;
      }
      break;
    }
    return left;
  }

  private parseUnary(): ExprNode {
    if (this.peek().type === "-") {
      const opTok = this.advance();
      const operand = this.parseUnary();
      return { type: "Unary", op: "-", operand, span: { start: opTok.span.start, end: operand.span.end } };
    }
    return this.parsePower();
  }

  private parsePower(): ExprNode {
    const base = this.parseAtom();
    if (this.peek().type === "^") {
      this.advance();
      const exponent = this.parseUnary(); // right-associative, binds through unary minus
      return { type: "Binary", op: "^", left: base, right: exponent, span: { start: base.span.start, end: exponent.span.end } };
    }
    return base;
  }

  private parseAtom(): ExprNode {
    const t = this.peek();

    if (t.type === "number") {
      this.advance();
      return { type: "Number", value: t.value!, span: t.span };
    }

    if (t.type === "(") {
      this.advance();
      const inner = this.parseExpr();
      const close = this.expect(")");
      return { ...inner, span: { start: t.span.start, end: close.span.end } };
    }

    if (t.type === "identifier") {
      this.advance();
      if (this.peek().type === "(" && isKnownFunction(t.text)) {
        this.advance(); // '('
        const args: ExprNode[] = [];
        if (this.peek().type !== ")") {
          args.push(this.parseExpr());
          while (this.peek().type === ",") {
            this.advance();
            args.push(this.parseExpr());
          }
        }
        const close = this.expect(")");
        const expectedArity = FUNCTION_ARITY[t.text];
        if (args.length !== expectedArity) {
          throw new ExprError(
            `Function '${t.text}' expects ${expectedArity} argument${expectedArity === 1 ? "" : "s"}, got ${args.length}`,
            { start: t.span.start, end: close.span.end },
          );
        }
        return { type: "Call", name: t.text, args, span: { start: t.span.start, end: close.span.end } };
      }
      // Not a recognized function name: treat as a plain identifier. If a
      // '(' follows (e.g. `x(y+1)`), parseTerm's implicit-multiplication
      // loop picks it up as `x * (y+1)` — this is a syntax-level decision
      // only; whether "x" is actually a *valid* identifier (vs. an unknown
      // one) is a semantic check made later, not here.
      return { type: "Identifier", name: t.text, span: t.span };
    }

    throw new ExprError(`Unexpected '${t.text || "end of expression"}'`, t.span);
  }
}

export function parseExpression(source: string): ExprNode {
  return new Parser(source).parseProgram();
}

export type { Span };
