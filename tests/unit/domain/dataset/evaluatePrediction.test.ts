import { describe, expect, it } from "vitest";
import { definesPrediction, evaluatePrediction, tracePerExample } from "../../../../src/domain/dataset/evaluatePerExampleLoss";
import { compilePerExampleLoss } from "../../../../src/domain/dataset/perExampleLoss";

const PARAMS = [{ name: "a" }, { name: "c" }];

function compile(source: string, columns = ["x", "y"]) {
  const { compiled, errors } = compilePerExampleLoss(source, PARAMS, columns);
  expect(errors).toEqual([]);
  return compiled!;
}

describe("evaluatePrediction", () => {
  it("evaluatePrediction_nonlinearCustomModel_evaluatesPrediction", () => {
    const loss = compile("prediction = a * x^2 + c\nloss = (prediction - y)^2");
    expect(evaluatePrediction(loss, { a: 2, c: 1 }, { x: 3 })).toBe(19);
  });

  it("evaluatePrediction_withoutTarget_stopsBeforeLossStatements", () => {
    const loss = compile("prediction = a * x + c\nerror = prediction - y\nloss = error^2");
    // `y` is absent: evaluating past `prediction` would throw.
    expect(evaluatePrediction(loss, { a: 1, c: 1 }, { x: 4 })).toBe(5);
  });

  it("evaluatePrediction_formulaWithoutPrediction_returnsNull", () => {
    const loss = compile("loss = (a * x + c - y)^2");
    expect(evaluatePrediction(loss, { a: 1, c: 0 }, { x: 1, y: 1 })).toBeNull();
    expect(definesPrediction(loss)).toBe(false);
  });

  it("definesPrediction_formulaWithPrediction_true", () => {
    expect(definesPrediction(compile("prediction = a * x + c\nloss = (prediction - y)^2"))).toBe(true);
  });
});

describe("tracePerExample", () => {
  it("tracePerExample_returnsEveryIntermediateValue", () => {
    const loss = compile("prediction = a * x + c\nerror = prediction - y\nloss = error^2");
    const trace = tracePerExample(loss, { a: 2, c: 1 }, { x: 3, y: 4 });
    expect(trace).toMatchObject({ prediction: 7, error: 3, loss: 9 });
  });
});
