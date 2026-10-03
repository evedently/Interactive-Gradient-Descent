import { describe, expect, it } from "vitest";
import { DatasetGradientSource } from "../../../../src/domain/dataset/DatasetGradientSource";
import { MODEL_TEMPLATES, TEMPLATE_PARAMETER_NAMES } from "../../../../src/domain/dataset/modelTemplates";
import { compilePerExampleLoss } from "../../../../src/domain/dataset/perExampleLoss";
import { traceBatch } from "../../../../src/domain/dataset/stepTrace";
import { SeededRng } from "../../../../src/domain/simulation/SeededRng";

const PARAMS = TEMPLATE_PARAMETER_NAMES.map((name) => ({ name }));
const DATASET = {
  columns: ["x", "y"],
  rows: Array.from({ length: 10 }, (_, i) => ({ x: i - 5, y: 2 * (i - 5) + 1 + (i % 3) * 0.1 })),
};

function linearLoss() {
  return compilePerExampleLoss(MODEL_TEMPLATES.linear.sourceText, PARAMS, DATASET.columns).compiled!;
}

describe("DatasetGradientSource batch indices", () => {
  it("sample_returnsTheRowsInTheBatch", () => {
    const source = new DatasetGradientSource(DATASET, linearLoss(), PARAMS, 4, new SeededRng(7));
    const sample = source.sample({ w: 0, b: 0 });
    expect(sample.batchRowIndices).toHaveLength(4);
    expect(new Set(sample.batchRowIndices).size).toBe(4);
    for (const i of sample.batchRowIndices) expect(i).toBeGreaterThanOrEqual(0);
  });
});

describe("traceBatch", () => {
  it("traceBatch_meanGradientAndLoss_equalSampledBatch", () => {
    const loss = linearLoss();
    const coords = { w: 0.5, b: -0.25 };
    const source = new DatasetGradientSource(DATASET, loss, PARAMS, 4, new SeededRng(3));
    const sample = source.sample(coords);

    const trace = traceBatch(loss, DATASET, sample.batchRowIndices, coords, PARAMS);

    expect(trace.rows.map((r) => r.rowIndex)).toEqual(sample.batchRowIndices);
    expect(trace.meanGradient).toEqual(sample.batchGradient);
    expect(trace.meanLoss).toEqual(sample.batchLoss);
  });

  it("traceBatch_rows_carryInputTargetPredictionAndLoss", () => {
    const loss = linearLoss();
    const trace = traceBatch(loss, DATASET, [0], { w: 2, b: 1 }, PARAMS);
    const row = trace.rows[0];
    expect(row.x).toBe(-5);
    expect(row.y).toBe(DATASET.rows[0].y);
    expect(row.prediction).toBe(-9);
    expect(row.loss).toBeCloseTo((-9 - DATASET.rows[0].y) ** 2);
    expect(Object.keys(row.gradient)).toEqual(["w", "b"]);
  });

  it("traceBatch_formulaWithoutPrediction_rowPredictionNull", () => {
    const loss = compilePerExampleLoss("loss = (w * x + b - y)^2", PARAMS, DATASET.columns).compiled!;
    expect(traceBatch(loss, DATASET, [1], { w: 1, b: 0 }, PARAMS).rows[0].prediction).toBeNull();
  });
});
