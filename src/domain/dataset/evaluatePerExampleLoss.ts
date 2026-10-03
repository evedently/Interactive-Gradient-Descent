import { evaluateExpr } from "../expr/evaluate";
import { PREDICTION_NAME } from "./modelTemplates";
import type { CompiledPerExampleLoss, Dataset } from "./types";

/**
 * Evaluates every statement of a compiled per-example loss for one row and
 * returns the full scope — parameters, row values, and every intermediate
 * (`prediction`, `error`, `loss`, ...). The step inspector shows these.
 */
export function tracePerExample(
  perExampleLoss: CompiledPerExampleLoss,
  coords: Readonly<Record<string, number>>,
  row: Readonly<Record<string, number>>,
): Record<string, number> {
  const scope: Record<string, number> = { ...coords, ...row };
  for (const statement of perExampleLoss.statements) {
    scope[statement.name] = evaluateExpr(statement.expr, scope);
  }
  return scope;
}

/**
 * Evaluates a compiled per-example loss for one CSV row at a given set of
 * primary-variable coordinates (DESIGN.md §7). Shared by `DatasetGradientSource`
 * (mini-batch/full gradient sampling) and `computeDatasetLossGrid` (the
 * full-dataset loss surface, Phase 7 extension) so both walk the exact same
 * statement sequence — a rule referencing the surface's loss value and one
 * driving a live run can never silently disagree.
 */
export function evaluatePerExampleLossForRow(
  perExampleLoss: CompiledPerExampleLoss,
  coords: Readonly<Record<string, number>>,
  row: Readonly<Record<string, number>>,
): number {
  return tracePerExample(perExampleLoss, coords, row)["loss"];
}

/** Whether this formula exposes a model output the data plot can draw. */
export function definesPrediction(perExampleLoss: CompiledPerExampleLoss): boolean {
  return perExampleLoss.statements.some((s) => s.name === PREDICTION_NAME);
}

/**
 * The model's output for one input, taken from the formula itself so the
 * model is defined in exactly one place. Statements run in order and stop as
 * soon as `prediction` is assigned, so `row` needs only what the model reads
 * (typically just `x` — never the target). Returns `null` when the formula
 * defines no `prediction`.
 */
export function evaluatePrediction(
  perExampleLoss: CompiledPerExampleLoss,
  coords: Readonly<Record<string, number>>,
  row: Readonly<Record<string, number>>,
): number | null {
  const scope: Record<string, number> = { ...coords, ...row };
  for (const statement of perExampleLoss.statements) {
    scope[statement.name] = evaluateExpr(statement.expr, scope);
    if (statement.name === PREDICTION_NAME) return scope[PREDICTION_NAME];
  }
  return null;
}

/** Mean per-example loss over every row in `dataset` at `coords` — the "full-dataset loss" DESIGN.md §7 distinguishes from a mini-batch's. */
export function computeFullDatasetLoss(
  perExampleLoss: CompiledPerExampleLoss,
  dataset: Dataset,
  coords: Readonly<Record<string, number>>,
): number {
  let sum = 0;
  for (const row of dataset.rows) sum += evaluatePerExampleLossForRow(perExampleLoss, coords, row);
  return sum / dataset.rows.length;
}
