import { evaluateExpr } from "../expr/evaluate";
import type { CompiledPerExampleLoss, Dataset } from "./types";

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
  const scope: Record<string, number> = { ...coords, ...row };
  for (const statement of perExampleLoss.statements) {
    scope[statement.name] = evaluateExpr(statement.expr, scope);
  }
  return scope["loss"];
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
