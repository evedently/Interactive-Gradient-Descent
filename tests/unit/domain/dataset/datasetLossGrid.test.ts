import { describe, expect, it } from "vitest";
import { computeDatasetLossGrid } from "../../../../src/domain/dataset/datasetLossGrid";
import { computeFullDatasetLoss } from "../../../../src/domain/dataset/evaluatePerExampleLoss";
import { compilePerExampleLoss } from "../../../../src/domain/dataset/perExampleLoss";
import type { Dataset } from "../../../../src/domain/dataset/types";

const WEIGHT_BIAS = [{ name: "weight" }, { name: "bias" }];

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

describe("computeDatasetLossGrid", () => {
  it("rejects anything other than exactly two primary variables", () => {
    const compiled = compileFixtureLoss();
    expect(() =>
      computeDatasetLossGrid(compiled, DATASET, [{ name: "weight" }], { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, 5),
    ).toThrow(/exactly two primary variables/);
  });

  it("each grid cell matches computeFullDatasetLoss at that cell's coordinates", () => {
    const compiled = compileFixtureLoss();
    const bounds = { xMin: -2, xMax: 2, yMin: -1, yMax: 1 };
    const resolution = 5;
    const grid = computeDatasetLossGrid(compiled, DATASET, WEIGHT_BIAS, bounds, resolution);

    expect(grid.xs).toHaveLength(resolution);
    expect(grid.ys).toHaveLength(resolution);
    expect(grid.values).toHaveLength(resolution * resolution);

    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        const expected = computeFullDatasetLoss(compiled, DATASET, { weight: grid.xs[col], bias: grid.ys[row] });
        expect(grid.values[row * resolution + col]).toBeCloseTo(expected, 9);
      }
    }
  });

  it("the grid's minimum sits at the dataset's true generating parameters (weight=2, bias=0)", () => {
    const compiled = compileFixtureLoss();
    const bounds = { xMin: 0, xMax: 4, yMin: -2, yMax: 2 };
    const resolution = 41; // lands exactly on weight=2, bias=0 at the midpoint
    const grid = computeDatasetLossGrid(compiled, DATASET, WEIGHT_BIAS, bounds, resolution);

    let minIndex = 0;
    for (let i = 1; i < grid.values.length; i++) if (grid.values[i] < grid.values[minIndex]) minIndex = i;
    const minRow = Math.floor(minIndex / resolution);
    const minCol = minIndex % resolution;

    expect(grid.xs[minCol]).toBeCloseTo(2, 6);
    expect(grid.ys[minRow]).toBeCloseTo(0, 6);
    expect(grid.values[minIndex]).toBeCloseTo(0, 6);
  });
});
