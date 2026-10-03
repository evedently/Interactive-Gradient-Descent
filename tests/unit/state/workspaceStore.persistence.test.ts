import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceStore } from "../../../src/state/workspaceStore";

function makeCsvFile(text: string, name = "data.csv"): File {
  return new File([text], name, { type: "text/csv" });
}

const VALID_CSV = "feature,target\n1,2\n2,4\n3,6\n4,8\n5,10\n";

describe("workspaceStore: save/load (DESIGN.md §16/§18 Phase 8)", () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  });

  it("round-trips a customized surface-mode workspace exactly (acceptance test §19 #11)", () => {
    const store = useWorkspaceStore.getState();
    store.setLossSourceText("(x - 5)^2 + (y - 2)^2");
    store.setStartPoint({ x: 1.5, y: -2.5 });
    store.setCameraMode("pan");
    store.setSeed(123);
    store.setNoiseLevel(0.5);
    store.addRule();
    const [ruleA, ruleB] = useWorkspaceStore.getState().rules;
    store.setRuleName(ruleA.id, "Custom Name");
    store.setRuleColor(ruleA.id, "#123456");
    store.setRuleVisible(ruleB.id, false);
    store.setRuleCollapsed(ruleB.id, true);
    store.setRuleSourceText(ruleA.id, "x_next = x - 0.05 * gx\ny_next = y - 0.05 * gy");
    store.setManualGradientEnabled(true);
    store.setManualGradientGx("2*x");
    store.setManualGradientGy("2*y");
    store.setSimLimits({ maxAbsPrimaryVariableValue: 500, maxAbsLoss: 9999, earlyStopLossThreshold: 1e-4 });
    store.setStepsPerSecond(12);
    store.setSurfaceBounds({ xMin: -0.01, xMax: 0.01, yMin: -500, yMax: 500 });

    const before = useWorkspaceStore.getState();
    const snapshot = before.exportSnapshot();

    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
    const { errors } = useWorkspaceStore.getState().loadWorkspaceSnapshot(snapshot);
    expect(errors).toEqual([]);

    const after = useWorkspaceStore.getState();
    expect(after.lossSourceText).toBe(before.lossSourceText);
    expect(after.startPoint).toEqual(before.startPoint);
    expect(after.cameraMode).toBe(before.cameraMode);
    expect(after.seed).toBe(before.seed);
    expect(after.noiseLevel).toBe(before.noiseLevel);
    expect(after.manualGradientEnabled).toBe(before.manualGradientEnabled);
    expect(after.manualGradientGxSource).toBe(before.manualGradientGxSource);
    expect(after.manualGradientGySource).toBe(before.manualGradientGySource);
    expect(after.simLimits).toEqual(before.simLimits);
    expect(after.stepsPerSecond).toBe(before.stepsPerSecond);
    expect(after.surfaceBounds).toEqual(before.surfaceBounds);
    expect(after.rules.map((r) => ({ name: r.name, color: r.color, visible: r.visible, collapsed: r.collapsed, sourceText: r.sourceText }))).toEqual(
      before.rules.map((r) => ({ name: r.name, color: r.color, visible: r.visible, collapsed: r.collapsed, sourceText: r.sourceText })),
    );
    for (const rule of after.rules) expect(rule.errors).toEqual([]);
  });

  it("round-trips a customized dataset-mode workspace, including the embedded dataset and per-example loss", () => {
    const store = useWorkspaceStore.getState();
    store.setMode("dataset");
    return store.loadDatasetFromFile(makeCsvFile(VALID_CSV)).then(() => {
      const s = useWorkspaceStore.getState();
      s.setDatasetPrimaryVariableNames(["weight", "bias"]);
      useWorkspaceStore.getState().setPerExampleLossSourceText("prediction = weight * feature + bias\nerror = prediction - target\nloss = error^2");
      useWorkspaceStore.getState().setDatasetInitialValues({ weight: 1, bias: -1 });
      useWorkspaceStore.getState().setBatchSize(3);
      useWorkspaceStore.getState().setDatasetRunTarget("epochs", 5);

      const before = useWorkspaceStore.getState();
      expect(before.activePerExampleLoss).not.toBeNull();
      const snapshot = before.exportSnapshot();

      useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
      const { errors } = useWorkspaceStore.getState().loadWorkspaceSnapshot(snapshot);
      expect(errors).toEqual([]);

      const after = useWorkspaceStore.getState();
      expect(after.mode).toBe("dataset");
      expect(after.datasetPrimaryVariableNames).toEqual(["weight", "bias"]);
      expect(after.dataset).toEqual(before.dataset);
      expect(after.perExampleLossSourceText).toBe(before.perExampleLossSourceText);
      expect(after.activePerExampleLoss).not.toBeNull();
      expect(after.perExampleLossErrors).toEqual([]);
      expect(after.datasetInitialValues).toEqual({ weight: 1, bias: -1 });
      expect(after.batchSize).toBe(3);
      expect(after.datasetRunTargetKind).toBe("epochs");
      expect(after.datasetRunTargetValue).toBe(5);
      for (const rule of after.rules) expect(rule.sourceText).toContain("weight_next");
    });
  });

  it("rejects a structurally invalid snapshot and leaves the current workspace untouched", () => {
    const before = useWorkspaceStore.getState();
    const beforeLoss = before.lossSourceText;
    const { errors } = useWorkspaceStore.getState().loadWorkspaceSnapshot({ not: "a workspace" });
    expect(errors.length).toBeGreaterThan(0);
    expect(useWorkspaceStore.getState().lossSourceText).toBe(beforeLoss);
  });

  it("loads a snapshot whose rule text no longer compiles by falling back to a working default while preserving the saved text and surfacing errors", () => {
    const snapshot = useWorkspaceStore.getState().exportSnapshot();
    snapshot.rules = [{ name: "Broken", color: "#ff0000", visible: true, collapsed: false, sourceText: "x_next = totally_undefined_identifier" }];

    const { errors } = useWorkspaceStore.getState().loadWorkspaceSnapshot(snapshot);
    expect(errors).toEqual([]);

    const state = useWorkspaceStore.getState();
    expect(state.rules).toHaveLength(1);
    expect(state.rules[0].sourceText).toBe("x_next = totally_undefined_identifier");
    expect(state.rules[0].errors.length).toBeGreaterThan(0);
    expect(state.rules[0].activeCompiledRule).toBeDefined(); // safe fallback, never crashes
  });

  it("exportSnapshot excludes secondaryPanelCollapsed (a view preference, not a workspace setting)", () => {
    const snapshot = useWorkspaceStore.getState().exportSnapshot() as unknown as Record<string, unknown>;
    expect(snapshot).not.toHaveProperty("secondaryPanelCollapsed");
  });
});

describe("workspaceStore: moveRule", () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
    useWorkspaceStore.getState().addRule();
  });

  const ids = () => useWorkspaceStore.getState().rules.map((r) => r.id);

  it("moveRule_lastToFirst_reordersRules", () => {
    const [a, b, c] = ids();
    useWorkspaceStore.getState().moveRule(c, 0);
    expect(ids()).toEqual([c, a, b]);
  });

  it("moveRule_firstToLast_reordersRules", () => {
    const [a, b, c] = ids();
    useWorkspaceStore.getState().moveRule(a, 2);
    expect(ids()).toEqual([b, c, a]);
  });

  it("moveRule_indexOutOfRange_clampsToEnds", () => {
    const [a, b, c] = ids();
    useWorkspaceStore.getState().moveRule(a, 99);
    expect(ids()).toEqual([b, c, a]);
    useWorkspaceStore.getState().moveRule(a, -5);
    expect(ids()).toEqual([a, b, c]);
  });

  it("moveRule_unknownId_leavesOrderUnchanged", () => {
    const before = ids();
    useWorkspaceStore.getState().moveRule("nope", 0);
    expect(ids()).toEqual(before);
  });

  it("moveRule_reorderedWorkspace_roundTripsThroughSnapshot", () => {
    const [, , c] = ids();
    useWorkspaceStore.getState().moveRule(c, 0);
    const names = useWorkspaceStore.getState().rules.map((r) => r.name);
    const snapshot = useWorkspaceStore.getState().exportSnapshot();
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
    useWorkspaceStore.getState().loadWorkspaceSnapshot(snapshot);
    expect(useWorkspaceStore.getState().rules.map((r) => r.name)).toEqual(names);
  });
});
