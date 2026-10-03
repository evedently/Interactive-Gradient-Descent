import { evaluatePrediction } from "../dataset/evaluatePerExampleLoss";
import { INPUT_NAME, TARGET_NAME } from "../dataset/modelTemplates";
import type { CompiledPerExampleLoss, Dataset } from "../dataset/types";
import { ExprError } from "../expr/errors";
import type { GridBounds } from "./grid";

/** Fraction of the data range added on each side so edge points aren't drawn on the frame. */
const PLOT_PADDING = 0.08;
/** A probability axis shows a little past 0 and 1 so the 0/1 points sit inside the frame. */
const PROBABILITY_AXIS: Pick<GridBounds, "yMin" | "yMax"> = { yMin: -0.1, yMax: 1.1 };

export type CurvePoint = { x: number; y: number };

/**
 * The model's prediction as a function of x, sampled at `count` evenly
 * spaced inputs — how the data plot draws ANY model (line, sigmoid, or a
 * custom curve) without special-casing it. Non-finite samples are dropped.
 * Returns `null` when there's nothing to draw: the formula defines no
 * `prediction`, or its prediction depends on columns other than x.
 */
export function sampleModelCurve(
  perExampleLoss: CompiledPerExampleLoss,
  coords: Readonly<Record<string, number>>,
  xMin: number,
  xMax: number,
  count: number,
): CurvePoint[] | null {
  const points: CurvePoint[] = [];
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? xMin : xMin + ((xMax - xMin) * i) / (count - 1);
    let y: number | null;
    try {
      y = evaluatePrediction(perExampleLoss, coords, { [INPUT_NAME]: x });
    } catch (err) {
      if (err instanceof ExprError) return null; // prediction reads another column — not a function of x alone
      throw err;
    }
    if (y === null) return null;
    if (Number.isFinite(y)) points.push({ x, y });
  }
  return points;
}

function paddedRange(values: readonly number[]): { min: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(min) || 1;
  return { min: min - span * PLOT_PADDING, max: max + span * PLOT_PADDING };
}

/** The data plot's visible window: the x/y data range plus padding, or a fixed 0–1-ish y axis when the model outputs a probability. */
export function dataPlotBounds(dataset: Dataset, probabilityAxis: boolean): GridBounds {
  const x = paddedRange(dataset.rows.map((r) => r[INPUT_NAME]));
  const y = probabilityAxis ? { min: PROBABILITY_AXIS.yMin, max: PROBABILITY_AXIS.yMax } : paddedRange(dataset.rows.map((r) => r[TARGET_NAME]));
  return { xMin: x.min, xMax: x.max, yMin: y.min, yMax: y.max };
}

/** Where the logistic template's predicted probability crosses 0.5 (w·x + b = 0), or `null` when w = 0 and no such x exists. */
export function logisticDecisionBoundary(coords: Readonly<Record<string, number>>): number | null {
  return coords.w === 0 ? null : -coords.b / coords.w;
}
