import type { PrimaryVariable } from "../rules/ruleCompiler";
import { rowLossGradient } from "./DatasetGradientSource";
import { evaluatePerExampleLossForRow, evaluatePrediction } from "./evaluatePerExampleLoss";
import { INPUT_NAME, TARGET_NAME } from "./modelTemplates";
import type { CompiledPerExampleLoss, Dataset } from "./types";

export interface TracedRow {
  rowIndex: number;
  x: number;
  y: number;
  /** `null` when the formula defines no `prediction`. */
  prediction: number | null;
  loss: number;
  gradient: Record<string, number>;
}

export interface BatchTrace {
  rows: TracedRow[];
  meanLoss: number;
  meanGradient: Record<string, number>;
}

/**
 * The step inspector's breakdown of one mini-batch: each row's input,
 * target, prediction, loss, and loss gradient, then their means. Uses the
 * same per-row loss and `rowLossGradient` as `DatasetGradientSource`, and
 * the same sum-then-divide order, so `meanGradient`/`meanLoss` equal the
 * batch gradient/loss the runner actually stepped with.
 */
export function traceBatch(
  perExampleLoss: CompiledPerExampleLoss,
  dataset: Dataset,
  rowIndices: readonly number[],
  coords: Readonly<Record<string, number>>,
  primaryVariables: readonly PrimaryVariable[],
): BatchTrace {
  const names = primaryVariables.map((v) => v.name);
  const gradientSum: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]));
  let lossSum = 0;

  const rows = rowIndices.map((rowIndex): TracedRow => {
    const row = dataset.rows[rowIndex];
    const loss = evaluatePerExampleLossForRow(perExampleLoss, coords, row);
    const gradient = rowLossGradient(perExampleLoss, row, coords, primaryVariables);
    lossSum += loss;
    for (const name of names) gradientSum[name] += gradient[name];
    return { rowIndex, x: row[INPUT_NAME], y: row[TARGET_NAME], prediction: evaluatePrediction(perExampleLoss, coords, row), loss, gradient };
  });

  const n = rowIndices.length;
  const meanGradient: Record<string, number> = {};
  for (const name of names) meanGradient[name] = gradientSum[name] / n;
  return { rows, meanLoss: lossSum / n, meanGradient };
}
