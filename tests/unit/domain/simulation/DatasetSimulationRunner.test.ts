import { describe, expect, it } from "vitest";
import { compilePerExampleLoss } from "../../../../src/domain/dataset/perExampleLoss";
import type { Dataset } from "../../../../src/domain/dataset/types";
import { compileRule } from "../../../../src/domain/rules/ruleCompiler";
import { parseRuleSource } from "../../../../src/domain/rules/ruleParser";
import { DatasetSimulationRunner } from "../../../../src/domain/simulation/DatasetSimulationRunner";
import { DEFAULT_SIM_LIMITS, type SimLimits } from "../../../../src/domain/simulation/types";

const WEIGHT_BIAS = [{ name: "weight" }, { name: "bias" }];

/** Same hand-computable fixture as DatasetGradientSource.test.ts: target = 2*feature exactly. */
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

function makeRunner(
  ruleSource: string,
  initialValues: Record<string, number> = { weight: 0, bias: 0 },
  batchSize = 3,
  seed = 42,
  simLimits: SimLimits = DEFAULT_SIM_LIMITS,
) {
  const { program, errors: parseErrors } = parseRuleSource(ruleSource);
  if (!program) throw new Error(`fixture rule failed to parse: ${JSON.stringify(parseErrors)}`);
  const { compiled, errors: compileErrors } = compileRule(program, WEIGHT_BIAS);
  if (!compiled) throw new Error(`fixture rule failed to compile: ${JSON.stringify(compileErrors)}`);
  return new DatasetSimulationRunner(compiled, WEIGHT_BIAS, initialValues, DATASET, compileFixtureLoss(), batchSize, seed, simLimits);
}

const GRADIENT_DESCENT = "weight_next = weight - 0.1 * gweight\nbias_next = bias - 0.1 * gbias";

describe("DatasetSimulationRunner: full-batch gradient descent matches a hand-computed step", () => {
  it("matches the hand-computed full-dataset gradient at weight=0, bias=0", () => {
    // Full-dataset gradient at (0,0): d/dweight = -18.666..., d/dbias = -8 (see DatasetGradientSource.test.ts).
    const runner = makeRunner(GRADIENT_DESCENT);
    const result = runner.step();
    expect(result.errored).toBe(false);
    expect(result.point!.coords.weight).toBeCloseTo(0 - 0.1 * (-56 / 3), 5);
    expect(result.point!.coords.bias).toBeCloseTo(0 - 0.1 * -8, 5);
  });
});

describe("DatasetSimulationRunner: play/pause/reset/step status machine", () => {
  it("starts idle with a single seeded trajectory point at the initial values", () => {
    const runner = makeRunner(GRADIENT_DESCENT, { weight: 1, bias: 2 });
    expect(runner.status).toBe("idle");
    expect(runner.trajectory).toHaveLength(1);
    expect(runner.current.coords).toEqual({ weight: 1, bias: 2 });
  });

  it("play() transitions to running; pause() only takes effect from running", () => {
    const runner = makeRunner(GRADIENT_DESCENT);
    runner.pause();
    expect(runner.status).toBe("idle");
    runner.play();
    expect(runner.status).toBe("running");
    runner.pause();
    expect(runner.status).toBe("paused");
  });

  it("reset() restores iteration 0, the initial values, and epoch/batch tracking", () => {
    // Constructing/resetting the runner draws one initial sample (so the
    // very first point has a real gradient to display), mirroring surface
    // mode drawing its first noise sample at construction (DESIGN.md §10) —
    // so `examplesProcessed` after reset equals one batch's worth, not zero.
    const runner = makeRunner(GRADIENT_DESCENT, { weight: 0, bias: 0 }, 1);
    const afterConstruction = runner.current.examplesProcessed;
    runner.step();
    runner.step();
    runner.step();
    expect(runner.iteration).toBe(3);
    runner.reset();
    expect(runner.iteration).toBe(0);
    expect(runner.current.coords).toEqual({ weight: 0, bias: 0 });
    expect(runner.current.epoch).toBe(0);
    expect(runner.current.examplesProcessed).toBe(afterConstruction);
  });
});

describe("DatasetSimulationRunner: parameter changes affect future steps only", () => {
  it("changing eta mid-run doesn't retroactively change already-recorded history", () => {
    const runner = makeRunner("parameter eta = 0.1 range 0 to 1\nweight_next = weight - eta * gweight\nbias_next = bias - eta * gbias");
    runner.step();
    const firstStepWeight = runner.current.coords.weight;
    runner.setParameterValue("eta", 0.5);
    expect(runner.current.coords.weight).toBe(firstStepWeight);
    runner.step();
    expect(runner.current.coords.weight).not.toBe(firstStepWeight);
  });
});

describe("DatasetSimulationRunner: divergence guard", () => {
  it("stops on a non-finite value, preserving the last valid state", () => {
    const runner = makeRunner("weight_next = weight - 1e308 * gweight\nbias_next = bias - 1e308 * gbias");
    const result = runner.step();
    expect(result.errored).toBe(true);
    expect(runner.status).toBe("error");
    expect(runner.current.coords).toEqual({ weight: 0, bias: 0 });
  });
});

describe("DatasetSimulationRunner: reproducibility (DESIGN.md §10)", () => {
  it("identical seed and batch size reproduce the same mini-batch trajectory", () => {
    const a = makeRunner(GRADIENT_DESCENT, { weight: 0, bias: 0 }, 1, 7);
    const b = makeRunner(GRADIENT_DESCENT, { weight: 0, bias: 0 }, 1, 7);
    for (let i = 0; i < 4; i++) {
      a.step();
      b.step();
    }
    expect(a.current.coords).toEqual(b.current.coords);
    expect(a.current.epoch).toBe(b.current.epoch);
  });

  it("setSeed is pending until the next reset, mirroring surface mode", () => {
    const runner = makeRunner(GRADIENT_DESCENT, { weight: 0, bias: 0 }, 1, 7);
    runner.step();
    const beforeReseed = runner.current.coords.weight;
    runner.setSeed(999);
    expect(runner.current.coords.weight).toBe(beforeReseed); // no immediate effect

    const control = makeRunner(GRADIENT_DESCENT, { weight: 0, bias: 0 }, 1, 7);
    control.step();
    expect(runner.current.coords.weight).toBe(control.current.coords.weight); // still the old seed's sequence

    runner.reset();
    runner.step();
    const reseeded = makeRunner(GRADIENT_DESCENT, { weight: 0, bias: 0 }, 1, 999);
    reseeded.step();
    expect(runner.current.coords.weight).toBe(reseeded.current.coords.weight);
  });
});

describe("DatasetSimulationRunner: batch size takes effect immediately, like a parameter", () => {
  it("setBatchSize changes the very next sample's batch size without a reset", () => {
    const runner = makeRunner(GRADIENT_DESCENT, { weight: 0, bias: 0 }, 1, 3);
    runner.step();
    const beforeResize = runner.current.examplesProcessed;
    runner.setBatchSize(3);
    runner.step();
    expect(runner.current.examplesProcessed - beforeResize).toBe(3);
  });
});

describe("DatasetSimulationRunner: divergence safeguards (DESIGN.md §17, Phase 9)", () => {
  it("stops when a primary variable exceeds maxAbsPrimaryVariableValue, preserving last valid state", () => {
    const limits: SimLimits = { ...DEFAULT_SIM_LIMITS, maxAbsPrimaryVariableValue: 10 };
    const runner = makeRunner("weight_next = weight + 1000\nbias_next = bias", { weight: 0, bias: 0 }, 3, 42, limits);
    const result = runner.step();
    expect(result.errored).toBe(true);
    expect(runner.status).toBe("error");
    expect(runner.current.coords).toEqual({ weight: 0, bias: 0 });
    expect(runner.lastError).toMatch(/safety bound/i);
  });

  it("stops when full-dataset loss exceeds maxAbsLoss, preserving last valid state", () => {
    const limits: SimLimits = { ...DEFAULT_SIM_LIMITS, maxAbsLoss: 100 };
    const runner = makeRunner("weight_next = weight + 1000\nbias_next = bias", { weight: 0, bias: 0 }, 3, 42, limits);
    const result = runner.step();
    expect(result.errored).toBe(true);
    expect(runner.status).toBe("error");
    expect(runner.current.coords).toEqual({ weight: 0, bias: 0 });
    expect(runner.lastError).toMatch(/safety bound/i);
  });

  it("a merely-oscillating (rapidly increasing) full loss below the safety bounds keeps running, not erroring", () => {
    const runner = makeRunner("weight_next = weight - 5 * gweight\nbias_next = bias - 5 * gbias", { weight: 0, bias: 0 }, 3, 42);
    const result = runner.step();
    expect(result.errored).toBe(false);
    expect(runner.status).not.toBe("error");
  });

  it("pauses (without erroring) once earlyStopLossThreshold is reached", () => {
    const limits: SimLimits = { ...DEFAULT_SIM_LIMITS, earlyStopLossThreshold: 1e-2 };
    const runner = makeRunner(GRADIENT_DESCENT, { weight: 0, bias: 0 }, 3, 42, limits);
    runner.play();
    for (let i = 0; i < 500 && runner.status === "running"; i++) runner.step();
    expect(runner.status).toBe("paused");
    expect(runner.current.fullLoss).toBeLessThanOrEqual(1e-2);
  });

  it("pauses (without erroring) once maxIterations is reached", () => {
    const limits: SimLimits = { ...DEFAULT_SIM_LIMITS, maxIterations: 3 };
    const runner = makeRunner(GRADIENT_DESCENT, { weight: 0, bias: 0 }, 3, 42, limits);
    runner.play();
    runner.step();
    runner.step();
    expect(runner.status).toBe("running");
    runner.step();
    expect(runner.iteration).toBe(3);
    expect(runner.status).toBe("paused");
  });

  it("setSimLimits takes effect on the very next step", () => {
    const runner = makeRunner(
      "weight_next = weight + 1000\nbias_next = bias",
      { weight: 0, bias: 0 },
      3,
      42,
      { ...DEFAULT_SIM_LIMITS, maxAbsPrimaryVariableValue: 1000 },
    );
    const result1 = runner.step();
    expect(result1.errored).toBe(false);
    runner.setSimLimits({ ...DEFAULT_SIM_LIMITS, maxAbsPrimaryVariableValue: 10 });
    const result2 = runner.step();
    expect(result2.errored).toBe(true);
  });
});

describe("DatasetSimulationRunner: epochs/seconds run target auto-pauses a continuous run", () => {
  it("pauses once the target epoch count is reached", () => {
    const runner = makeRunner(GRADIENT_DESCENT, { weight: 0, bias: 0 }, 1, 5);
    runner.setRunTarget({ kind: "epochs", value: 1 });
    runner.play();
    for (let i = 0; i < 3 && runner.status === "running"; i++) runner.step();
    expect(runner.status).toBe("paused");
    expect(runner.current.epoch).toBeGreaterThanOrEqual(1);
  });
});
