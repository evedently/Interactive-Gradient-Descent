import { describe, expect, it } from "vitest";
import { compilePerExampleLoss } from "../../../../src/domain/dataset/perExampleLoss";

const WEIGHT_BIAS = [{ name: "weight" }, { name: "bias" }];
const FEATURE_TARGET = ["feature", "target"];

describe("compilePerExampleLoss", () => {
  it("compiles the design doc's worked linear-regression example", () => {
    const source = "prediction = weight * feature + bias\nerror = prediction - target\nloss = error^2";
    const { compiled, errors } = compilePerExampleLoss(source, WEIGHT_BIAS, FEATURE_TARGET);
    expect(errors).toEqual([]);
    expect(compiled?.statements.map((s) => s.name)).toEqual(["prediction", "error", "loss"]);
  });

  it("rejects a definition that never assigns 'loss'", () => {
    const { compiled, errors } = compilePerExampleLoss("prediction = weight * feature + bias", WEIGHT_BIAS, FEATURE_TARGET);
    expect(compiled).toBeNull();
    expect(errors.some((e) => /must assign 'loss'/.test(e.message))).toBe(true);
  });

  it("rejects a parameter declaration inside a per-example loss", () => {
    const source = "parameter eta = 0.1 range 0 to 1\nloss = (weight - feature)^2";
    const { compiled, errors } = compilePerExampleLoss(source, WEIGHT_BIAS, FEATURE_TARGET);
    expect(compiled).toBeNull();
    expect(errors.some((e) => /no parameter\/state declarations/.test(e.message))).toBe(true);
  });

  it("rejects a state declaration inside a per-example loss", () => {
    const source = "state acc = 0\nloss = (weight - feature)^2";
    const { compiled, errors } = compilePerExampleLoss(source, WEIGHT_BIAS, FEATURE_TARGET);
    expect(compiled).toBeNull();
    expect(errors.some((e) => /no parameter\/state declarations/.test(e.message))).toBe(true);
  });

  it("rejects a reference to an undefined identifier", () => {
    const { compiled, errors } = compilePerExampleLoss("loss = (weight - nonexistent)^2", WEIGHT_BIAS, FEATURE_TARGET);
    expect(compiled).toBeNull();
    expect(errors.some((e) => /Undefined variable 'nonexistent'/.test(e.message))).toBe(true);
  });

  it("rejects a CSV column name that collides with a primary variable name", () => {
    const { compiled, errors } = compilePerExampleLoss("loss = (weight - feature)^2", WEIGHT_BIAS, ["weight", "target"]);
    expect(compiled).toBeNull();
    expect(errors.some((e) => /collides with primary variable 'weight'/.test(e.message))).toBe(true);
  });

  it("rejects an assignment that reuses a CSV column's or primary variable's name", () => {
    const { compiled, errors } = compilePerExampleLoss("feature = 1\nloss = feature", WEIGHT_BIAS, FEATURE_TARGET);
    expect(compiled).toBeNull();
    expect(errors.some((e) => /'feature' is a CSV column and cannot be assigned/.test(e.message))).toBe(true);
  });

  it("rejects a statement referencing its own name before it's defined", () => {
    const { compiled, errors } = compilePerExampleLoss("loss = loss + 1", WEIGHT_BIAS, FEATURE_TARGET);
    expect(compiled).toBeNull();
    expect(errors.some((e) => /'loss' cannot reference itself/.test(e.message))).toBe(true);
  });

  it("propagates a syntax error from the underlying expression parser", () => {
    const { compiled, errors } = compilePerExampleLoss("loss = (weight +", WEIGHT_BIAS, FEATURE_TARGET);
    expect(compiled).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });
});
