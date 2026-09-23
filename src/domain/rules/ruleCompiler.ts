import { collectIdentifiers } from "../expr/ast";
import type { ExprNode } from "../expr/ast";
import type { RuleError, RuleProgram } from "./ruleTypes";

export interface ParameterDecl {
  name: string;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
  log: boolean;
}

export interface StateDecl {
  name: string;
  initExpr: ExprNode;
}

export interface BodyStatement {
  name: string;
  expr: ExprNode;
}

export interface CompiledRule {
  parameters: ParameterDecl[];
  stateDecls: StateDecl[];
  bodyStatements: BodyStatement[];
}

/** One variable a rule optimizes: `{name: "x"}`/`{name: "y"}` in surface mode, presenter-named model parameters in dataset mode (DESIGN.md §4/§7, Phase 7). */
export interface PrimaryVariable {
  name: string;
}

export const SURFACE_PRIMARY_VARIABLES: readonly PrimaryVariable[] = [{ name: "x" }, { name: "y" }];

/**
 * Generalizes `RESERVED_INPUTS`/`REQUIRED_OUTPUTS` beyond the fixed `x`/`y`
 * pair (DESIGN.md §4's primary-variable list): each primary variable
 * contributes itself, its gradient (`g` + name, matching the existing
 * `gx`/`gy` convention), and a required `${name}_next` output.
 */
function reservedInputsFor(primaryVariables: readonly PrimaryVariable[]): string[] {
  return [...primaryVariables.map((v) => v.name), ...primaryVariables.map((v) => `g${v.name}`), "loss", "iteration", "elapsed_time"];
}

function requiredOutputsFor(primaryVariables: readonly PrimaryVariable[]): string[] {
  return primaryVariables.map((v) => `${v.name}_next`);
}

/**
 * Validates a parsed rule program (DESIGN.md §4) and partitions it into the
 * three shapes the runtime needs: `parameters` (constants until Phase 3
 * adds sliders), `stateDecls` (initializers re-run only on Reset), and
 * `bodyStatements` (the per-step assignment sequence).
 *
 * Scoping rules, enforced by a single left-to-right pass:
 *  - `parameter`/`state` declarations may not reuse a reserved input name or
 *    a name already declared as a parameter or state variable.
 *  - a `state` initializer may reference only parameters and *earlier*
 *    state declarations — not reserved inputs, and not plain assignments
 *    (there is no "current step" at reset time).
 *  - a plain assignment (including the required `x_next`/`y_next`) may
 *    reference reserved inputs, parameters, state variables, and earlier
 *    assignments in the same program — ordinary strict sequential scoping.
 *  - a statement referencing its own name, before it has been defined by
 *    anything else, gets a distinct "cannot reference itself" message
 *    rather than a generic "undefined variable" one (this is the one case
 *    strict sequential evaluation can still flag as a dependency problem,
 *    per DESIGN.md §4's discussion of why true multi-variable cycles can't
 *    otherwise arise here).
 *
 * `primaryVariables` defaults to the fixed surface-mode `x`/`y` pair —
 * omitting it reproduces every Phase 1–6 call site's behavior exactly.
 * Dataset mode (Phase 7) passes its own two presenter-named variables
 * instead, so `weight_next`/`bias_next` (say) become the required outputs
 * and `gweight`/`gbias` the reserved gradient inputs.
 */
export function compileRule(
  program: RuleProgram,
  primaryVariables: readonly PrimaryVariable[] = SURFACE_PRIMARY_VARIABLES,
): { compiled: CompiledRule | null; errors: RuleError[] } {
  const reservedInputs = reservedInputsFor(primaryVariables);
  const requiredOutputs = requiredOutputsFor(primaryVariables);
  const reservedInputSet = new Set(reservedInputs);

  const errors: RuleError[] = [];
  const paramNames = new Set<string>();
  const stateNames = new Set<string>();
  const allDefined = new Set<string>(reservedInputs);

  const parameters: ParameterDecl[] = [];
  const stateDecls: StateDecl[] = [];
  const bodyStatements: BodyStatement[] = [];

  for (const statement of program.statements) {
    if (statement.kind === "parameter") {
      if (reservedInputSet.has(statement.name)) {
        errors.push({ message: `'${statement.name}' is a read-only simulation input and cannot be declared as a parameter`, span: statement.nameSpan });
        continue;
      }
      if (allDefined.has(statement.name)) {
        errors.push({ message: `'${statement.name}' is already declared`, span: statement.nameSpan });
        continue;
      }
      paramNames.add(statement.name);
      allDefined.add(statement.name);
      parameters.push({
        name: statement.name,
        defaultValue: statement.defaultValue,
        min: statement.min,
        max: statement.max,
        step: statement.step,
        log: statement.log,
      });
      continue;
    }

    if (statement.kind === "state") {
      if (reservedInputSet.has(statement.name)) {
        errors.push({ message: `'${statement.name}' is a read-only simulation input and cannot be declared as state`, span: statement.nameSpan });
        continue;
      }
      if (allDefined.has(statement.name)) {
        errors.push({ message: `'${statement.name}' is already declared`, span: statement.nameSpan });
        continue;
      }
      for (const ref of collectIdentifiers(statement.initExpr)) {
        const allowed = paramNames.has(ref.name) || stateNames.has(ref.name);
        if (!allowed) {
          if (ref.name === statement.name) {
            errors.push({ message: `'${statement.name}' cannot reference itself in its own initializer`, span: ref.span });
          } else {
            errors.push({
              message: `Undefined variable '${ref.name}' (a state initializer may only reference parameters and earlier state declarations)`,
              span: ref.span,
            });
          }
        }
      }
      stateNames.add(statement.name);
      allDefined.add(statement.name);
      stateDecls.push({ name: statement.name, initExpr: statement.initExpr });
      continue;
    }

    // assignment
    if (reservedInputSet.has(statement.name)) {
      errors.push({ message: `'${statement.name}' is a read-only simulation input and cannot be assigned`, span: statement.nameSpan });
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

  const statements = program.statements;
  const lastStatement = statements[statements.length - 1];
  const endSpan = lastStatement ? { start: lastStatement.span.end, end: lastStatement.span.end } : { start: 0, end: 0 };

  for (const output of requiredOutputs) {
    if (!allDefined.has(output)) {
      errors.push({ message: `Rule must assign '${output}' (the next-position output)`, span: endSpan });
    }
  }

  if (errors.length > 0) {
    return { compiled: null, errors };
  }
  return { compiled: { parameters, stateDecls, bodyStatements }, errors: [] };
}
