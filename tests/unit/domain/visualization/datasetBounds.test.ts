import { describe, expect, it } from "vitest";
import { computeDatasetLossGrid } from "../../../../src/domain/dataset/datasetLossGrid";
import { compilePerExampleLoss } from "../../../../src/domain/dataset/perExampleLoss";
import type { Dataset } from "../../../../src/domain/dataset/types";
import {
  fitDatasetBounds,
  initialDatasetBounds,
  MAX_BOUNDS_SPAN_FACTOR,
  resolveDatasetSurfaceBounds,
  TrajectoryExtentTracker,
  unionExtents,
} from "../../../../src/domain/visualization/datasetBounds";

const WEIGHT_BIAS = [{ name: "weight" }, { name: "bias" }];

describe("initialDatasetBounds", () => {
  it("centers a generous default window on zero initial values", () => {
    const bounds = initialDatasetBounds({ weight: 0, bias: 0 }, WEIGHT_BIAS);
    expect(bounds.xMin).toBeLessThan(0);
    expect(bounds.xMax).toBeGreaterThan(0);
    expect(bounds.yMin).toBeLessThan(0);
    expect(bounds.yMax).toBeGreaterThan(0);
  });

  it("widens the window to scale with a large initial value", () => {
    const bounds = initialDatasetBounds({ weight: 100, bias: 0 }, WEIGHT_BIAS);
    expect(bounds.xMax - bounds.xMin).toBeGreaterThan(200);
    expect(bounds.xMin).toBeLessThan(100);
    expect(bounds.xMax).toBeGreaterThan(100);
  });

  it("defaults missing initial values to zero", () => {
    const bounds = initialDatasetBounds({}, WEIGHT_BIAS);
    expect(bounds.xMin).toBeLessThan(0);
    expect(bounds.xMax).toBeGreaterThan(0);
  });
});

const HOME = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
const span = (b: { xMin: number; xMax: number; yMin: number; yMax: number }) => ({ x: b.xMax - b.xMin, y: b.yMax - b.yMin });

describe("fitDatasetBounds", () => {
  it("fitDatasetBounds_extentInsideCurrent_returnsSameReference", () => {
    const current = { ...HOME };
    expect(fitDatasetBounds(current, HOME, { xMin: -1, xMax: 1, yMin: -1, yMax: 1 })).toBe(current);
  });

  it("fitDatasetBounds_noExtentAndCurrentIsHome_returnsSameReference", () => {
    const current = { ...HOME };
    expect(fitDatasetBounds(current, HOME, null)).toBe(current);
  });

  it("fitDatasetBounds_extentOutside_growsToContainItWithMargin", () => {
    const next = fitDatasetBounds(HOME, HOME, { xMin: 0, xMax: 12, yMin: -30, yMax: 0 });
    expect(next.xMax).toBeGreaterThan(12);
    expect(next.yMin).toBeLessThan(-30);
    expect(next.xMin).toBeLessThanOrEqual(HOME.xMin);
  });

  it("fitDatasetBounds_singlePointOutside_notDrawnOnTheEdge", () => {
    const next = fitDatasetBounds(HOME, HOME, { xMin: 3, xMax: 3, yMin: -23, yMax: -23 });
    const homeSpan = span(HOME).y;
    expect(-23 - next.yMin).toBeGreaterThanOrEqual(homeSpan * 0.1 - 1e-9);
  });

  it("fitDatasetBounds_growingExtent_neverShrinksMidRun", () => {
    let bounds = HOME;
    let previous = span(bounds);
    for (const reach of [6, 9, 15, 15.5, 30, 31]) {
      bounds = fitDatasetBounds(bounds, HOME, { xMin: 0, xMax: reach, yMin: -1, yMax: 1 });
      const now = span(bounds);
      expect(now.x).toBeGreaterThanOrEqual(previous.x);
      expect(bounds.xMax).toBeGreaterThan(reach);
      previous = now;
    }
  });

  it("fitDatasetBounds_afterReset_shrinksBackToHome", () => {
    const grown = fitDatasetBounds(HOME, HOME, { xMin: 0, xMax: 400, yMin: -1, yMax: 1 });
    expect(fitDatasetBounds(grown, HOME, { xMin: 0, xMax: 0, yMin: 0, yMax: 0 })).toEqual(HOME);
    expect(fitDatasetBounds(grown, HOME, null)).toEqual(HOME);
  });

  it("fitDatasetBounds_hugeExtent_cappedRelativeToHome", () => {
    const next = fitDatasetBounds(HOME, HOME, { xMin: -1e6, xMax: 1e6, yMin: 0, yMax: 1e9 });
    expect(span(next).x).toBeLessThanOrEqual(span(HOME).x * MAX_BOUNDS_SPAN_FACTOR + 1e-9);
    expect(span(next).y).toBeLessThanOrEqual(span(HOME).y * MAX_BOUNDS_SPAN_FACTOR + 1e-9);
    // Stable once capped: a still-huge extent doesn't keep producing new bounds.
    expect(fitDatasetBounds(next, HOME, { xMin: -1e6, xMax: 1e6, yMin: 0, yMax: 1e9 })).toBe(next);
  });
});

describe("TrajectoryExtentTracker", () => {
  const xy = (p: { a: number; b: number }) => [p.a, p.b] as const;

  it("extentOf_points_coversThem", () => {
    const tracker = new TrajectoryExtentTracker<{ a: number; b: number }>(xy);
    expect(tracker.extentOf([{ a: 1, b: -2 }, { a: -3, b: 4 }])).toEqual({ xMin: -3, xMax: 1, yMin: -2, yMax: 4 });
  });

  it("extentOf_sameArrayGrows_includesNewPoints", () => {
    const tracker = new TrajectoryExtentTracker<{ a: number; b: number }>(xy);
    const trajectory = [{ a: 0, b: 0 }];
    tracker.extentOf(trajectory);
    trajectory.push({ a: 10, b: -10 });
    expect(tracker.extentOf(trajectory)).toEqual({ xMin: 0, xMax: 10, yMin: -10, yMax: 0 });
  });

  it("extentOf_newArray_startsFresh", () => {
    const tracker = new TrajectoryExtentTracker<{ a: number; b: number }>(xy);
    tracker.extentOf([{ a: 0, b: 0 }, { a: 100, b: 100 }]);
    expect(tracker.extentOf([{ a: 1, b: 1 }])).toEqual({ xMin: 1, xMax: 1, yMin: 1, yMax: 1 });
  });

  it("extentOf_nonFinitePoints_ignored", () => {
    const tracker = new TrajectoryExtentTracker<{ a: number; b: number }>(xy);
    expect(tracker.extentOf([{ a: NaN, b: 0 }, { a: 2, b: Infinity }])).toBeNull();
    expect(tracker.extentOf([])).toBeNull();
  });
});

describe("unionExtents", () => {
  it("unionExtents_skipsNullsAndCoversTheRest", () => {
    expect(unionExtents([null, { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, { xMin: -2, xMax: 0, yMin: 3, yMax: 4 }])).toEqual({
      xMin: -2,
      xMax: 1,
      yMin: 0,
      yMax: 4,
    });
    expect(unionExtents([null])).toBeNull();
  });
});

describe("resolveDatasetSurfaceBounds", () => {
  const DATASET: Dataset = {
    columns: ["feature", "target"],
    rows: [
      { feature: 1, target: 2 },
      { feature: 2, target: 4 },
      { feature: 3, target: 6 },
    ],
  };
  const PER_EXAMPLE_LOSS_SOURCE = "prediction = weight * feature + bias\nerror = prediction - target\nloss = error^2";

  function compileFixtureLoss() {
    const { compiled, errors } = compilePerExampleLoss(PER_EXAMPLE_LOSS_SOURCE, WEIGHT_BIAS, DATASET.columns);
    if (!compiled) throw new Error(`fixture failed to compile: ${JSON.stringify(errors)}`);
    return compiled;
  }

  it("seeds bounds from initialDatasetBounds on the very first call", () => {
    const perExampleLoss = compileFixtureLoss();
    const state = resolveDatasetSurfaceBounds(null, DATASET, perExampleLoss, WEIGHT_BIAS, { weight: 0, bias: 0 });
    expect(state.bounds).toEqual(initialDatasetBounds({ weight: 0, bias: 0 }, WEIGHT_BIAS));
  });

  it("reseeds when the dataset, per-example loss, or primary variables actually change", () => {
    const perExampleLoss = compileFixtureLoss();
    const state1 = resolveDatasetSurfaceBounds(null, DATASET, perExampleLoss, WEIGHT_BIAS, { weight: 0, bias: 0 });
    const otherDataset: Dataset = { ...DATASET, rows: [...DATASET.rows] };
    const state2 = resolveDatasetSurfaceBounds(state1, otherDataset, perExampleLoss, WEIGHT_BIAS, { weight: 100, bias: 0 });
    expect(state2.bounds).not.toEqual(state1.bounds);
    expect(state2.bounds).toEqual(initialDatasetBounds({ weight: 100, bias: 0 }, WEIGHT_BIAS));
  });

  it("keeps the exact same bounds reference when only the initial values (the starting point) change — the rendered domain must stay fixed", () => {
    const perExampleLoss = compileFixtureLoss();
    const state1 = resolveDatasetSurfaceBounds(null, DATASET, perExampleLoss, WEIGHT_BIAS, { weight: 0, bias: 0 });
    // "Changing the starting point": same dataset/loss/primaryVariables identity, only initialValues differs.
    const state2 = resolveDatasetSurfaceBounds(state1, DATASET, perExampleLoss, WEIGHT_BIAS, { weight: 3, bias: -2 });
    expect(state2).toBe(state1);
    expect(state2.bounds).toBe(state1.bounds);
  });

  it("acceptance: evaluating the loss surface on a fixed grid produces identical values before and after changing the starting point", () => {
    const perExampleLoss = compileFixtureLoss();
    const resolution = 11;

    const before = resolveDatasetSurfaceBounds(null, DATASET, perExampleLoss, WEIGHT_BIAS, { weight: 0, bias: 0 });
    const gridBefore = computeDatasetLossGrid(perExampleLoss, DATASET, WEIGHT_BIAS, before.bounds, resolution);

    // Changing the starting point must never recompute bounds, and therefore never change the evaluated grid.
    const after = resolveDatasetSurfaceBounds(before, DATASET, perExampleLoss, WEIGHT_BIAS, { weight: 3, bias: -2 });
    const gridAfter = computeDatasetLossGrid(perExampleLoss, DATASET, WEIGHT_BIAS, after.bounds, resolution);

    expect(after.bounds).toEqual(before.bounds);
    expect(Array.from(gridAfter.values)).toEqual(Array.from(gridBefore.values));
    expect(Array.from(gridAfter.xs)).toEqual(Array.from(gridBefore.xs));
    expect(Array.from(gridAfter.ys)).toEqual(Array.from(gridBefore.ys));
  });
});
