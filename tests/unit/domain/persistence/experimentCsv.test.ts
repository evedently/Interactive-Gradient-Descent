import { describe, expect, it } from "vitest";
import { buildDatasetExperimentCsv, buildSurfaceExperimentCsv } from "../../../../src/domain/persistence/experimentCsv";
import { compilePerExampleLoss } from "../../../../src/domain/dataset/perExampleLoss";
import type { Dataset } from "../../../../src/domain/dataset/types";
import { parseLossFunction, toResolvedLoss } from "../../../../src/domain/lossFunction";
import { compileRule } from "../../../../src/domain/rules/ruleCompiler";
import { parseRuleSource } from "../../../../src/domain/rules/ruleParser";
import { DatasetSimulationRunner } from "../../../../src/domain/simulation/DatasetSimulationRunner";
import { SimulationRunner } from "../../../../src/domain/simulation/SimulationRunner";

const WEIGHT_BIAS = [{ name: "weight" }, { name: "bias" }];

function makeSurfaceRunner(): SimulationRunner {
  const loss = parseLossFunction("(x - 3)^2 + 4*(y + 1)^2");
  if (!loss.ok) throw new Error("fixture loss failed to parse");
  const { program } = parseRuleSource("x_next = x - 0.1 * gx\ny_next = y - 0.1 * gy");
  const { compiled } = compileRule(program!);
  return new SimulationRunner(toResolvedLoss(loss), compiled!, { x: 0, y: 0 }, 42, 0);
}

const DATASET: Dataset = {
  columns: ["feature", "target"],
  rows: [
    { feature: 1, target: 2 },
    { feature: 2, target: 4 },
  ],
};

function makeDatasetRunner(): DatasetSimulationRunner {
  const { compiled: perExampleLoss } = compilePerExampleLoss(
    "prediction = weight * feature + bias\nerror = prediction - target\nloss = error^2",
    WEIGHT_BIAS,
    DATASET.columns,
  );
  const { program } = parseRuleSource("weight_next = weight - 0.1 * gweight\nbias_next = bias - 0.1 * gbias");
  const { compiled } = compileRule(program!, WEIGHT_BIAS);
  return new DatasetSimulationRunner(compiled!, WEIGHT_BIAS, { weight: 0, bias: 0 }, DATASET, perExampleLoss!, 2, 7);
}

describe("buildSurfaceExperimentCsv", () => {
  it("has the expected header and one data row per trajectory point across all rules", () => {
    const runner = makeSurfaceRunner();
    runner.step();
    const csv = buildSurfaceExperimentCsv([{ id: "r1", name: "Gradient Descent" }], new Map([["r1", runner]]));
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("rule,iteration,elapsed_ms,x,y,loss,gx,gy,noisy_gx,noisy_gy");
    expect(lines).toHaveLength(1 + runner.trajectory.length);
    expect(lines[1].startsWith("Gradient Descent,0,")).toBe(true);
    expect(lines[2].startsWith("Gradient Descent,1,")).toBe(true);
  });

  it("quotes a rule name containing a comma", () => {
    const runner = makeSurfaceRunner();
    const csv = buildSurfaceExperimentCsv([{ id: "r1", name: "A, B" }], new Map([["r1", runner]]));
    expect(csv).toContain('"A, B"');
  });

  it("skips a rule id with no matching runner rather than throwing", () => {
    const csv = buildSurfaceExperimentCsv([{ id: "missing", name: "Ghost" }], new Map());
    expect(csv.trim().split("\n")).toHaveLength(1); // header only
  });
});

describe("buildDatasetExperimentCsv", () => {
  it("has the expected header including epoch/batch columns and one column per primary variable", () => {
    const runner = makeDatasetRunner();
    runner.step();
    const csv = buildDatasetExperimentCsv([{ id: "d1", name: "Momentum" }], new Map([["d1", runner]]), WEIGHT_BIAS);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("rule,iteration,elapsed_ms,epoch,batch_index,examples_processed,batch_loss,full_loss,weight,bias");
    expect(lines).toHaveLength(1 + runner.trajectory.length);
  });

  it("includes the correct coordinate values in each row", () => {
    const runner = makeDatasetRunner();
    runner.step();
    const csv = buildDatasetExperimentCsv([{ id: "d1", name: "Momentum" }], new Map([["d1", runner]]), WEIGHT_BIAS);
    const lastLine = csv.trim().split("\n").at(-1)!;
    const fields = lastLine.split(",");
    const weight = Number(fields.at(-2));
    const bias = Number(fields.at(-1));
    expect(weight).toBeCloseTo(runner.current.coords.weight, 9);
    expect(bias).toBeCloseTo(runner.current.coords.bias, 9);
  });
});
