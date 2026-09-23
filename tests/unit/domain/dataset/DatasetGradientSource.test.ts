import { describe, expect, it } from "vitest";
import { compilePerExampleLoss } from "../../../../src/domain/dataset/perExampleLoss";
import { DatasetGradientSource } from "../../../../src/domain/dataset/DatasetGradientSource";
import { SeededRng } from "../../../../src/domain/simulation/SeededRng";
import type { Dataset } from "../../../../src/domain/dataset/types";

const WEIGHT_BIAS = [{ name: "weight" }, { name: "bias" }];

/**
 * Hand-computable fixture: `target = 2 * feature` exactly, per-example loss
 * `error^2` where `error = prediction - target`, `prediction = weight *
 * feature + bias`. At weight=0, bias=0: prediction=0 for every row, so
 * error = -target = -2*feature, loss = 4*feature^2.
 *   d(loss)/d(weight) = 2*error*feature = -2*target*feature = -4*feature^2
 *   d(loss)/d(bias)   = 2*error         = -2*target         = -4*feature
 * Rows: feature = 1, 2, 3 -> target = 2, 4, 6.
 *   per-row d/dweight: -4, -16, -36  -> mean -18.666...
 *   per-row d/dbias:   -4, -8, -12   -> mean -8
 *   per-row loss: 4, 16, 36 -> mean 18.666...
 */
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

describe("DatasetGradientSource", () => {
  it("computes the full-dataset gradient and loss matching a hand-computed result within tolerance", () => {
    const source = new DatasetGradientSource(DATASET, compileFixtureLoss(), WEIGHT_BIAS, 3, new SeededRng(1));
    const sample = source.sample({ weight: 0, bias: 0 });
    expect(sample.fullLoss).toBeCloseTo((4 + 16 + 36) / 3, 4);
    expect(sample.fullGradient.weight).toBeCloseTo((-4 + -16 + -36) / 3, 3);
    expect(sample.fullGradient.bias).toBeCloseTo((-4 + -8 + -12) / 3, 3);
  });

  it("a full-size mini-batch matches the full-dataset gradient", () => {
    const source = new DatasetGradientSource(DATASET, compileFixtureLoss(), WEIGHT_BIAS, 3, new SeededRng(7));
    const sample = source.sample({ weight: 0, bias: 0 });
    expect(sample.batchLoss).toBeCloseTo(sample.fullLoss, 6);
    expect(sample.batchGradient.weight).toBeCloseTo(sample.fullGradient.weight, 5);
    expect(sample.batchGradient.bias).toBeCloseTo(sample.fullGradient.bias, 5);
  });

  it("a mini-batch of one row matches that single row's hand-computed gradient", () => {
    // batchSize 1: the shuffle order is seed-dependent, so instead of
    // asserting a specific row, assert the batch gradient always equals
    // *one* of the three rows' exact analytic per-row gradients.
    const source = new DatasetGradientSource(DATASET, compileFixtureLoss(), WEIGHT_BIAS, 1, new SeededRng(42));
    const sample = source.sample({ weight: 0, bias: 0 });
    const perRowWeightGradients = [-4, -16, -36];
    const perRowBiasGradients = [-4, -8, -12];
    expect(perRowWeightGradients.some((g) => Math.abs(g - sample.batchGradient.weight) < 1e-3)).toBe(true);
    expect(perRowBiasGradients.some((g) => Math.abs(g - sample.batchGradient.bias) < 1e-3)).toBe(true);
  });

  it("tracks epoch, batch index, and examples processed across multiple mini-batches", () => {
    const source = new DatasetGradientSource(DATASET, compileFixtureLoss(), WEIGHT_BIAS, 2, new SeededRng(3));
    const first = source.sample({ weight: 0, bias: 0 });
    expect(first.batchIndex).toBe(1);
    expect(first.epoch).toBe(0);
    expect(first.examplesProcessed).toBe(2);

    // Second batch of 2 exhausts the 3-row dataset mid-batch, wrapping into a new epoch.
    const second = source.sample({ weight: 0, bias: 0 });
    expect(second.epoch).toBe(1);
    expect(second.batchIndex).toBe(1);
    expect(second.examplesProcessed).toBe(4);
  });

  it("reset restarts epoch/batch tracking and reproduces the same batch sequence for the same seed", () => {
    const compiled = compileFixtureLoss();
    const a = new DatasetGradientSource(DATASET, compiled, WEIGHT_BIAS, 1, new SeededRng(99));
    const firstRun = [a.sample({ weight: 0, bias: 0 }), a.sample({ weight: 0, bias: 0 }), a.sample({ weight: 0, bias: 0 })];

    a.reset(new SeededRng(99));
    const secondRun = [a.sample({ weight: 0, bias: 0 }), a.sample({ weight: 0, bias: 0 }), a.sample({ weight: 0, bias: 0 })];

    expect(secondRun.map((s) => s.batchGradient.weight)).toEqual(firstRun.map((s) => s.batchGradient.weight));
    expect(secondRun.map((s) => s.epoch)).toEqual(firstRun.map((s) => s.epoch));
  });
});
