import { collectIdentifiers } from "../expr/ast";
import type { PrimaryVariable } from "../rules/ruleCompiler";
import { parseRuleSource } from "../rules/ruleParser";
import type { RuleError } from "../rules/ruleTypes";
import type { CompiledPerExampleLoss } from "./types";

const REQUIRED_FINAL_NAME = "loss";

/**
 * Compiles a per-example loss definition (DESIGN.md §7): reuses the same
 * `name = expression` statement grammar as an update rule's body, minus
 * `parameter`/`state` declarations (a per-example loss has no tunable
 * hyperparameters or persistent state of its own — it's an ordinary,
 * stateless function of one CSV row and the workspace's primary variables,
 * re-evaluated fresh per row). Reserved identifiers are the two primary
 * variables (the model parameters being optimized) plus every CSV column;
 * the final statement must define `loss`.
 */
export function compilePerExampleLoss(
  sourceText: string,
  primaryVariables: readonly PrimaryVariable[],
  csvColumns: readonly string[],
): { compiled: CompiledPerExampleLoss | null; errors: RuleError[] } {
  const { program, errors: parseErrors } = parseRuleSource(sourceText);
  if (!program) return { compiled: null, errors: parseErrors };

  const errors: RuleError[] = [];
  const primaryVariableNames = new Set(primaryVariables.map((v) => v.name));
  const columnSet = new Set(csvColumns);

  for (const name of csvColumns) {
    if (primaryVariableNames.has(name)) {
      errors.push({
        message: `CSV column '${name}' collides with primary variable '${name}' — rename one to disambiguate`,
        span: { start: 0, end: 0 },
      });
    }
  }

  const allDefined = new Set<string>([...primaryVariableNames, ...columnSet]);
  const bodyStatements: CompiledPerExampleLoss["statements"] = [];

  for (const statement of program.statements) {
    if (statement.kind !== "assignment") {
      errors.push({
        message: "Per-example loss definitions may only contain 'name = expression' lines (no parameter/state declarations)",
        span: statement.span,
      });
      continue;
    }
    if (allDefined.has(statement.name)) {
      const reason = primaryVariableNames.has(statement.name) ? "a primary variable" : columnSet.has(statement.name) ? "a CSV column" : "already declared";
      errors.push({ message: `'${statement.name}' is ${reason} and cannot be assigned`, span: statement.nameSpan });
      continue;
    }
    for (const ref of collectIdentifiers(statement.expr)) {
      if (!allDefined.has(ref.name)) {
        if (ref.name === statement.name) {
          errors.push({ message: `'${statement.name}' cannot reference itself in its own defining statement`, span: ref.span });
        } else {
          errors.push({ message: `Undefined variable '${ref.name}'`, span: ref.span });
        }
      }
    }
    allDefined.add(statement.name);
    bodyStatements.push({ name: statement.name, expr: statement.expr });
  }

  if (!allDefined.has(REQUIRED_FINAL_NAME)) {
    const last = program.statements[program.statements.length - 1];
    const endSpan = last ? { start: last.span.end, end: last.span.end } : { start: 0, end: 0 };
    errors.push({ message: "Per-example loss definition must assign 'loss'", span: endSpan });
  }

  if (errors.length > 0) return { compiled: null, errors };
  return { compiled: { statements: bodyStatements }, errors: [] };
}
