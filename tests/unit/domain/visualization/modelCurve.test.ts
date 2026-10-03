import { describe, expect, it } from "vitest";
import { MODEL_TEMPLATES } from "../../../../src/domain/dataset/modelTemplates";
import { compilePerExampleLoss } from "../../../../src/domain/dataset/perExampleLoss";
import { dataPlotBounds, logisticDecisionBoundary, sampleModelCurve } from "../../../../src/domain/visualization/modelCurve";

const WB = [{ name: "w" }, { name: "b" }];

function compile(source: string, columns = ["x", "y"]) {
  const { compiled, errors } = compilePerExampleLoss(source, WB, columns);
  expect(errors).toEqual([]);
  return compiled!;
}

describe("sampleModelCurve", () => {
  it("sampleModelCurve_linear_evenlySpacedPointsOnTheLine", () => {
    const curve = sampleModelCurve(compile(MODEL_TEMPLATES.linear.sourceText), { w: 2, b: 1 }, -1, 1, 5);
    expect(curve).toEqual([
      { x: -1, y: -1 },
      { x: -0.5, y: 0 },
      { x: 0, y: 1 },
      { x: 0.5, y: 2 },
      { x: 1, y: 3 },
    ]);
  });

  it("sampleModelCurve_nonlinearCustom_followsPrediction", () => {
    const curve = sampleModelCurve(compile("prediction = w * x^2 + b\nloss = (prediction - y)^2"), { w: 1, b: 0 }, -2, 2, 3);
    expect(curve!.map((p) => p.y)).toEqual([4, 0, 4]);
  });

  it("sampleModelCurve_noPrediction_null", () => {
    expect(sampleModelCurve(compile("loss = (w * x + b - y)^2"), { w: 1, b: 0 }, 0, 1, 3)).toBeNull();
  });

  it("sampleModelCurve_predictionUsesOtherColumns_null", () => {
    const loss = compile("prediction = w * x + b * extra\nloss = (prediction - y)^2", ["x", "y", "extra"]);
    expect(sampleModelCurve(loss, { w: 1, b: 1 }, 0, 1, 3)).toBeNull();
  });

  it("sampleModelCurve_nonFiniteValues_dropped", () => {
    const curve = sampleModelCurve(compile("prediction = w / x + b\nloss = (prediction - y)^2"), { w: 1, b: 0 }, -1, 1, 3);
    expect(curve).toEqual([
      { x: -1, y: -1 },
      { x: 1, y: 1 },
    ]);
  });
});

describe("dataPlotBounds", () => {
  const dataset = { columns: ["x", "y"], rows: [{ x: 0, y: 10 }, { x: 10, y: 20 }] };

  it("dataPlotBounds_padsTheDataRange", () => {
    const b = dataPlotBounds(dataset, false);
    expect(b.xMin).toBeLessThan(0);
    expect(b.xMax).toBeGreaterThan(10);
    expect(b.yMin).toBeLessThan(10);
    expect(b.yMax).toBeGreaterThan(20);
  });

  it("dataPlotBounds_probabilityAxis_fixedAroundZeroToOne", () => {
    const b = dataPlotBounds(dataset, true);
    expect(b.yMin).toBeLessThan(0);
    expect(b.yMin).toBeGreaterThan(-0.5);
    expect(b.yMax).toBeGreaterThan(1);
    expect(b.yMax).toBeLessThan(1.5);
  });

  it("dataPlotBounds_constantColumn_stillHasWidth", () => {
    const b = dataPlotBounds({ columns: ["x", "y"], rows: [{ x: 3, y: 3 }] }, false);
    expect(b.xMax).toBeGreaterThan(b.xMin);
    expect(b.yMax).toBeGreaterThan(b.yMin);
  });
});

describe("logisticDecisionBoundary", () => {
  it("logisticDecisionBoundary_isMinusBOverW", () => {
    expect(logisticDecisionBoundary({ w: 2, b: -6 })).toBe(3);
  });

  it("logisticDecisionBoundary_zeroWeight_null", () => {
    expect(logisticDecisionBoundary({ w: 0, b: 1 })).toBeNull();
  });
});
