import { shiftSpans } from "../expr/ast";
import { ExprError } from "../expr/errors";
import { parseExpression } from "../expr/parser";
import type { ParameterStatement, RuleError, RuleProgram, RuleStatement, StateStatement } from "./ruleTypes";

const ASSIGNMENT_LINE = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*)=(\s*)(.*)$/;
const STATE_LINE = /^(\s*)state\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const PARAMETER_PREFIX = /^(\s*)parameter\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S+)\s+range\s+(\S+)\s+to\s+(\S+)/;
const STARTS_WITH_STATE_KEYWORD = /^\s*state\b/;
const STARTS_WITH_PARAMETER_KEYWORD = /^\s*parameter\b/;

function parseNumberToken(text: string): number | null {
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * Parses a `parameter name = default range min to max [step s] [log]` line.
 * The mandatory `parameter NAME = DEFAULT range MIN to MAX` prefix is
 * matched with a regex; the optional trailing `step`/`log` modifiers (which
 * may appear in either order) are parsed from whatever text remains after
 * it, so error spans for the fixed prefix stay precise while the flexible
 * suffix just gets a whole-line span — a reasonable trade-off for a small,
 * fixed-shape declaration syntax.
 */
function parseParameterLine(rawLine: string, lineStart: number): ParameterStatement | RuleError {
  const match = PARAMETER_PREFIX.exec(rawLine);
  const lineSpan = { start: lineStart, end: lineStart + rawLine.length };
  if (!match) {
    return { message: "Expected 'parameter <name> = <default> range <min> to <max>'", span: lineSpan };
  }
  const [whole, leading, name, defaultText, minText, maxText] = match;
  const nameStart = lineStart + leading.length;
  const nameSpan = { start: nameStart, end: nameStart + name.length };

  const defaultValue = parseNumberToken(defaultText);
  const min = parseNumberToken(minText);
  const max = parseNumberToken(maxText);
  if (defaultValue === null) return { message: `Invalid default value '${defaultText}' — expected a number`, span: lineSpan };
  if (min === null) return { message: `Invalid range minimum '${minText}' — expected a number`, span: lineSpan };
  if (max === null) return { message: `Invalid range maximum '${maxText}' — expected a number`, span: lineSpan };
  if (min >= max) return { message: `Parameter '${name}' range minimum (${min}) must be less than its maximum (${max})`, span: lineSpan };
  if (defaultValue < min || defaultValue > max) {
    return { message: `Parameter '${name}' default value (${defaultValue}) must be within its range [${min}, ${max}]`, span: lineSpan };
  }

  const remainder = rawLine.slice(whole.length);
  let step: number | undefined;
  const stepMatch = /\bstep\s+(\S+)/.exec(remainder);
  if (stepMatch) {
    const stepValue = parseNumberToken(stepMatch[1]);
    if (stepValue === null) return { message: `Invalid step '${stepMatch[1]}' — expected a number`, span: lineSpan };
    if (stepValue <= 0) return { message: `Parameter '${name}' step must be positive`, span: lineSpan };
    step = stepValue;
  }
  const log = /\blog\b/.test(remainder);
  if (log && min <= 0) {
    return { message: `Parameter '${name}' uses 'log' scaling, which requires a positive range minimum (got ${min})`, span: lineSpan };
  }

  const consumed = remainder
    .replace(/\bstep\s+\S+/, "")
    .replace(/\blog\b/, "")
    .trim();
  if (consumed.length > 0) {
    return { message: `Unexpected trailing text in parameter declaration: '${consumed}'`, span: lineSpan };
  }

  return { kind: "parameter", name, nameSpan, defaultValue, min, max, step, log, span: lineSpan };
}

function parseStateLine(rawLine: string, lineStart: number): StateStatement | RuleError {
  const match = STATE_LINE.exec(rawLine);
  if (!match) {
    return {
      message: "Expected 'state <name> = <expression>'",
      span: { start: lineStart, end: lineStart + rawLine.length },
    };
  }
  const [, leading, name, rhsRaw] = match;
  const nameStart = lineStart + leading.length;
  const rhsStart = lineStart + rawLine.length - rhsRaw.length;
  try {
    const expr = parseExpression(rhsRaw);
    return {
      kind: "state",
      name,
      nameSpan: { start: nameStart, end: nameStart + name.length },
      initExpr: shiftSpans(expr, rhsStart),
      span: { start: lineStart, end: lineStart + rawLine.length },
    };
  } catch (err) {
    if (err instanceof ExprError) {
      return { message: err.message, span: { start: rhsStart + err.span.start, end: rhsStart + err.span.end } };
    }
    throw err;
  }
}

function isRuleError(value: unknown): value is RuleError {
  return typeof value === "object" && value !== null && "message" in value && !("kind" in value);
}

/**
 * Parses an update-rule program: a sequence of `parameter ...`, `state
 * ...`, or plain `name = expression` lines, one per line (DESIGN.md §3b/§4,
 * generalized in Phase 2 beyond Phase 1's assignment-only subset). Blank
 * lines are skipped. Parsing continues past a bad line so every syntax
 * error in the program can be reported at once.
 */
export function parseRuleSource(source: string): { program: RuleProgram | null; errors: RuleError[] } {
  const errors: RuleError[] = [];
  const statements: RuleStatement[] = [];

  const lines = source.split("\n");
  let lineStart = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      lineStart += rawLine.length + 1;
      continue;
    }

    let result: RuleStatement | RuleError;
    if (STARTS_WITH_PARAMETER_KEYWORD.test(rawLine)) {
      result = parseParameterLine(rawLine, lineStart);
    } else if (STARTS_WITH_STATE_KEYWORD.test(rawLine)) {
      result = parseStateLine(rawLine, lineStart);
    } else {
      const match = ASSIGNMENT_LINE.exec(rawLine);
      if (!match) {
        result = { message: "Expected 'name = expression'", span: { start: lineStart, end: lineStart + rawLine.length } };
      } else {
        const [, leading, name, , , rhsRaw] = match;
        const nameStart = lineStart + leading.length;
        const rhsStart = lineStart + rawLine.length - rhsRaw.length;
        try {
          const expr = parseExpression(rhsRaw);
          result = {
            kind: "assignment",
            name,
            nameSpan: { start: nameStart, end: nameStart + name.length },
            expr: shiftSpans(expr, rhsStart),
            span: { start: lineStart, end: lineStart + rawLine.length },
          };
        } catch (err) {
          if (err instanceof ExprError) {
            result = { message: err.message, span: { start: rhsStart + err.span.start, end: rhsStart + err.span.end } };
          } else {
            throw err;
          }
        }
      }
    }

    if (isRuleError(result)) {
      errors.push(result);
    } else {
      statements.push(result);
    }

    lineStart += rawLine.length + 1;
  }

  if (errors.length > 0) {
    return { program: null, errors };
  }
  return { program: { statements }, errors: [] };
}
