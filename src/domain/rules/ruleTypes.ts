import type { ExprNode, Span } from "../expr/ast";

/** `parameter name = default range min to max [step s] [log]` (DESIGN.md §3b/§4). */
export interface ParameterStatement {
  kind: "parameter";
  name: string;
  nameSpan: Span;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
  log: boolean;
  span: Span;
}

/** `state name = initExpr` — initExpr may reference only parameters and earlier state declarations (DESIGN.md §4). */
export interface StateStatement {
  kind: "state";
  name: string;
  nameSpan: Span;
  initExpr: ExprNode;
  span: Span;
}

/** A plain `name = expr` line: an intermediate variable, or one of the required `x_next`/`y_next` outputs. */
export interface AssignmentStatement {
  kind: "assignment";
  name: string;
  nameSpan: Span;
  expr: ExprNode;
  span: Span;
}

export type RuleStatement = ParameterStatement | StateStatement | AssignmentStatement;

export interface RuleProgram {
  statements: RuleStatement[];
}

/** Span is an absolute character offset into the full rule source text (consistent with ExprError). */
export interface RuleError {
  message: string;
  span: Span;
}

/** Converts an absolute character offset into 1-based (line, column) for display purposes. */
export function offsetToLineColumn(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline };
}
