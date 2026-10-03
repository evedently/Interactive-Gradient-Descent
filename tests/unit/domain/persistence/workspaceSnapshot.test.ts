import { describe, expect, it } from "vitest";
import { validateWorkspaceSnapshot, WORKSPACE_SCHEMA_VERSION } from "../../../../src/domain/persistence/workspaceSnapshot";

function validSnapshot(): Record<string, unknown> {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    mode: "surface",
    lossSourceText: "(x - 3)^2 + 4*(y + 1)^2",
    manualGradientEnabled: false,
    manualGradientGxSource: "",
    manualGradientGySource: "",
    rules: [{ name: "Gradient Descent", color: "#ff6b35", visible: true, collapsed: false, sourceText: "x_next = x - 0.1 * gx\ny_next = y - 0.1 * gy" }],
    startPoint: { x: 0, y: 0 },
    cameraMode: "rotate",
    seed: 42,
    noiseLevel: 0,
    datasetPrimaryVariableNames: ["theta_0", "theta_1"],
    dataset: null,
    datasetFileName: null,
    perExampleLossSourceText: "",
    datasetInitialValues: { theta_0: 0, theta_1: 0 },
    batchSize: 8,
    datasetRunTargetKind: "continuous",
    datasetRunTargetValue: 10,
    simLimits: { maxIterations: 200_000, maxAbsPrimaryVariableValue: 1_000_000, maxAbsLoss: 1_000_000_000_000, earlyStopLossThreshold: undefined },
    stepsPerSecond: 4,
    surfaceBounds: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
  };
}

describe("validateWorkspaceSnapshot", () => {
  it("accepts a well-formed snapshot", () => {
    const { snapshot, errors } = validateWorkspaceSnapshot(validSnapshot());
    expect(errors).toEqual([]);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.rules).toHaveLength(1);
  });

  it("accepts an embedded dataset with numeric rows", () => {
    const value = validSnapshot();
    value.dataset = { columns: ["feature", "target"], rows: [{ feature: 1, target: 2 }] };
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(errors).toEqual([]);
    expect(snapshot?.dataset?.rows).toEqual([{ feature: 1, target: 2 }]);
  });

  it("rejects a non-object value", () => {
    const { snapshot, errors } = validateWorkspaceSnapshot("not an object");
    expect(snapshot).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects an unsupported schema version", () => {
    const value = validSnapshot();
    value.schemaVersion = 99;
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(snapshot).toBeNull();
    expect(errors.some((e) => /schemaVersion/.test(e))).toBe(true);
  });

  it("rejects an invalid mode", () => {
    const value = validSnapshot();
    value.mode = "surfaceish";
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(snapshot).toBeNull();
    expect(errors.some((e) => /mode/.test(e))).toBe(true);
  });

  it("rejects an empty rules array", () => {
    const value = validSnapshot();
    value.rules = [];
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(snapshot).toBeNull();
    expect(errors.some((e) => /rules/.test(e))).toBe(true);
  });

  it("rejects a rule missing a required field", () => {
    const value = validSnapshot();
    value.rules = [{ name: "Broken", color: "#fff", visible: true, collapsed: false }]; // missing sourceText
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(snapshot).toBeNull();
    expect(errors.some((e) => /rules\[0\]\.sourceText/.test(e))).toBe(true);
  });

  it("rejects a dataset row with a non-numeric column value", () => {
    const value = validSnapshot();
    value.dataset = { columns: ["feature"], rows: [{ feature: "not a number" }] };
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(snapshot).toBeNull();
    expect(errors.some((e) => /dataset\.rows\[0\]/.test(e))).toBe(true);
  });

  it("rejects a malformed startPoint", () => {
    const value = validSnapshot();
    value.startPoint = { x: "0", y: 0 };
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(snapshot).toBeNull();
    expect(errors.some((e) => /startPoint/.test(e))).toBe(true);
  });

  it("rejects an invalid datasetRunTargetKind", () => {
    const value = validSnapshot();
    value.datasetRunTargetKind = "forever";
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(snapshot).toBeNull();
    expect(errors.some((e) => /datasetRunTargetKind/.test(e))).toBe(true);
  });

  it("accepts simLimits with maxIterations omitted (uncapped)", () => {
    const value = validSnapshot();
    const { maxIterations, ...rest } = value.simLimits as Record<string, unknown>;
    value.simLimits = rest;
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(errors).toEqual([]);
    expect(snapshot?.simLimits.maxIterations).toBeUndefined();
  });

  it("rejects a malformed simLimits", () => {
    const value = validSnapshot();
    value.simLimits = { maxAbsPrimaryVariableValue: "a lot", maxAbsLoss: 1 };
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(snapshot).toBeNull();
    expect(errors.some((e) => /simLimits/.test(e))).toBe(true);
  });

  it("accepts simLimits with earlyStopLossThreshold set", () => {
    const value = validSnapshot();
    value.simLimits = { ...(value.simLimits as Record<string, unknown>), earlyStopLossThreshold: 1e-4 };
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(errors).toEqual([]);
    expect(snapshot?.simLimits.earlyStopLossThreshold).toBe(1e-4);
  });

  it("rejects a non-numeric stepsPerSecond", () => {
    const value = validSnapshot();
    value.stepsPerSecond = "fast";
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(snapshot).toBeNull();
    expect(errors.some((e) => /stepsPerSecond/.test(e))).toBe(true);
  });

  it("accepts a much smaller or larger surfaceBounds window", () => {
    const value = validSnapshot();
    value.surfaceBounds = { xMin: -0.001, xMax: 0.001, yMin: -0.001, yMax: 0.001 };
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(errors).toEqual([]);
    expect(snapshot?.surfaceBounds).toEqual({ xMin: -0.001, xMax: 0.001, yMin: -0.001, yMax: 0.001 });
  });

  it("rejects an inverted surfaceBounds range", () => {
    const value = validSnapshot();
    value.surfaceBounds = { xMin: 10, xMax: -10, yMin: -10, yMax: 10 };
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(snapshot).toBeNull();
    expect(errors.some((e) => /surfaceBounds/.test(e))).toBe(true);
  });

  it("rejects a malformed surfaceBounds", () => {
    const value = validSnapshot();
    value.surfaceBounds = { xMin: -10, xMax: 10 };
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    expect(snapshot).toBeNull();
    expect(errors.some((e) => /surfaceBounds/.test(e))).toBe(true);
  });

  it("collects every structural error at once rather than stopping at the first", () => {
    const { errors } = validateWorkspaceSnapshot({ schemaVersion: 99, mode: "nonsense" });
    expect(errors.length).toBeGreaterThan(2);
  });
});
