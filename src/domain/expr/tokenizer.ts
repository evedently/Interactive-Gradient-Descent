import { ExprError } from "./errors";
import type { Span } from "./ast";

export type TokenType =
  | "number"
  | "identifier"
  | "+"
  | "-"
  | "*"
  | "/"
  | "^"
  | "("
  | ")"
  | ","
  | "eof";

export interface Token {
  type: TokenType;
  text: string;
  value?: number; // populated for "number" tokens
  span: Span;
}

const SIMPLE_TOKENS: Record<string, TokenType> = {
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "/",
  "^": "^",
  "(": "(",
  ")": ")",
  ",": ",",
};

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

/** Tokenizes a single mathematical expression. Whitespace is insignificant and skipped. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];

    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i++;
      continue;
    }

    if (isDigit(ch) || (ch === "." && isDigit(source[i + 1] ?? ""))) {
      const start = i;
      while (i < n && isDigit(source[i])) i++;
      if (source[i] === ".") {
        i++;
        while (i < n && isDigit(source[i])) i++;
      }
      // Exponent suffix, e.g. 1e-3
      if (source[i] === "e" || source[i] === "E") {
        const expStart = i;
        let j = i + 1;
        if (source[j] === "+" || source[j] === "-") j++;
        if (isDigit(source[j] ?? "")) {
          i = j;
          while (i < n && isDigit(source[i])) i++;
        } else {
          i = expStart; // not actually an exponent, back off
        }
      }
      const text = source.slice(start, i);
      const value = Number(text);
      tokens.push({ type: "number", text, value, span: { start, end: i } });
      continue;
    }

    if (isIdentStart(ch)) {
      const start = i;
      i++;
      while (i < n && isIdentPart(source[i])) i++;
      tokens.push({ type: "identifier", text: source.slice(start, i), span: { start, end: i } });
      continue;
    }

    if (ch in SIMPLE_TOKENS) {
      tokens.push({ type: SIMPLE_TOKENS[ch], text: ch, span: { start: i, end: i + 1 } });
      i++;
      continue;
    }

    throw new ExprError(`Unexpected character '${ch}'`, { start: i, end: i + 1 });
  }

  tokens.push({ type: "eof", text: "", span: { start: n, end: n } });
  return tokens;
}
