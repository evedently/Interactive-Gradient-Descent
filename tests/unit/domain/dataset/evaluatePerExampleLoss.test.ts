import { describe, expect, it } from "vitest";
import { compilePerExampleLoss } from "../../../../src/domain/dataset/perExampleLoss";
import { computeFullDatasetLoss, evaluatePerExampleLossForRow } from "../../../../src/domain/dataset/evaluatePerExampleLoss";
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

describe("evaluatePerExampleLossForRow", () => {
  it("matches a hand-computed value for a single row", () => {
    const compiled = compileFixtureLoss();
    // weight=1, bias=0, feature=2, target=4: prediction=2, error=-2, loss=4.
    const loss = evaluatePerExampleLossForRow(compiled, { weight: 1, bias: 0 }, { feature: 2, target: 4 });
    expect(loss).toBeCloseTo(4, 6);
  });
});

describe("computeFullDatasetLoss", () => {
  it("matches the mean of the hand-computed per-row losses", () => {
    const compiled = compileFixtureLoss();
    // weight=0, bias=0: prediction=0 for every row, loss = target^2 -> 4, 16, 36 -> mean 18.666...
    const loss = computeFullDatasetLoss(compiled, DATASET, { weight: 0, bias: 0 });
    expect(loss).toBeCloseTo((4 + 16 + 36) / 3, 6);
  });

  it("is exactly zero at the dataset's true generating parameters", () => {
    const compiled = compileFixtureLoss();
    // target = 2*feature exactly, so weight=2, bias=0 fits every row perfectly.
    const loss = computeFullDatasetLoss(compiled, DATASET, { weight: 2, bias: 0 });
    expect(loss).toBeCloseTo(0, 9);
  });
});
