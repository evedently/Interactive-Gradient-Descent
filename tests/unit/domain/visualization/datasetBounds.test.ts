import { describe, expect, it } from "vitest";
import { computeDatasetLossGrid } from "../../../../src/domain/dataset/datasetLossGrid";
import { compilePerExampleLoss } from "../../../../src/domain/dataset/perExampleLoss";
import type { Dataset } from "../../../../src/domain/dataset/types";
import { expandBoundsToInclude, initialDatasetBounds, resolveDatasetSurfaceBounds } from "../../../../src/domain/visualization/datasetBounds";

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

describe("expandBoundsToInclude", () => {
  const bounds = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };

  it("returns the exact same reference when the point is already inside", () => {
    expect(expandBoundsToInclude(bounds, 1, -1)).toBe(bounds);
  });

  it("expands to contain a point outside the current bounds, with margin", () => {
    const next = expandBoundsToInclude(bounds, 10, 0);
    expect(next).not.toBe(bounds);
    expect(next.xMax).toBeGreaterThan(10);
    expect(next.xMin).toBeLessThanOrEqual(-5);
  });

  it("expands on the y axis independently of x", () => {
    const next = expandBoundsToInclude(bounds, 0, -20);
    expect(next.yMin).toBeLessThan(-20);
    expect(next.xMin).toBe(bounds.xMin);
    expect(next.xMax).toBe(bounds.xMax);
  });

  it("ignores a non-finite point rather than producing a non-finite bounds", () => {
    expect(expandBoundsToInclude(bounds, NaN, 0)).toBe(bounds);
    expect(expandBoundsToInclude(bounds, 0, Infinity)).toBe(bounds);
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
