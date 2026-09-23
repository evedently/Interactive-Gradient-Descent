import type { Span } from "./ast";

/**
 * A syntax or validation error anchored to a span in the source text it was
 * found in. Character offsets are relative to whatever string was parsed —
 * callers that slice a larger document (e.g. one line of a multi-line rule)
 * are responsible for translating `span` back to that document's own
 * coordinates (see rules/ruleParser.ts).
 */
export class ExprError extends Error {
  readonly span: Span;

  constructor(message: string, span: Span) {
    super(message);
    this.name = "ExprError";
    this.span = span;
  }
}
