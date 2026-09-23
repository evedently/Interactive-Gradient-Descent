import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES, useWorkspaceStore } from "../../../src/state/workspaceStore";

function makeCsvFile(text: string, name = "data.csv"): File {
  return new File([text], name, { type: "text/csv" });
}

const VALID_CSV = "feature,target\n1,2\n2,4\n3,6\n";

describe("workspaceStore: dataset mode (DESIGN.md §18 Phase 7)", () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  });

  it("defaults to surface mode with the fixed x/y primary variables", () => {
    const state = useWorkspaceStore.getState();
    expect(state.mode).toBe("surface");
    expect(state.primaryVariables.map((v) => v.name)).toEqual(["x", "y"]);
  });

  it("switching to dataset mode adopts the presenter's (or default) primary-variable names and regenerates every rule so it still compiles", () => {
    useWorkspaceStore.getState().setMode("dataset");
    const state = useWorkspaceStore.getState();
    expect(state.primaryVariables.map((v) => v.name)).toEqual(DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES);
    for (const rule of state.rules) {
      expect(rule.errors).toEqual([]);
      expect(rule.sourceText).toContain(`${DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES[0]}_next`);
    }
  });

  it("switching back to surface mode restores x/y and regenerates rules against them", () => {
    useWorkspaceStore.getState().setMode("dataset");
    useWorkspaceStore.getState().setMode("surface");
    const state = useWorkspaceStore.getState();
    expect(state.primaryVariables.map((v) => v.name)).toEqual(["x", "y"]);
    for (const rule of state.rules) {
      expect(rule.errors).toEqual([]);
      expect(rule.sourceText).toContain("x_next");
    }
  });

  it("renaming dataset primary variables while in dataset mode regenerates rules under the new names", () => {
    useWorkspaceStore.getState().setMode("dataset");
    useWorkspaceStore.getState().setDatasetPrimaryVariableNames(["weight", "bias"]);
    const state = useWorkspaceStore.getState();
    expect(state.primaryVariables.map((v) => v.name)).toEqual(["weight", "bias"]);
    expect(state.datasetInitialValues).toEqual({ weight: 0, bias: 0 });
    for (const rule of state.rules) {
      expect(rule.errors).toEqual([]);
      expect(rule.sourceText).toContain("weight_next");
    }
  });

  it("renaming dataset primary variables while still in surface mode does not touch the live rules", () => {
    const before = useWorkspaceStore.getState().rules;
    useWorkspaceStore.getState().setDatasetPrimaryVariableNames(["weight", "bias"]);
    const state = useWorkspaceStore.getState();
    expect(state.rules).toBe(before);
    expect(state.primaryVariables.map((v) => v.name)).toEqual(["x", "y"]);
  });

  it("loading a valid CSV populates the dataset and compiles the default per-example loss against theta_0/theta_1", () => {
    useWorkspaceStore.getState().setMode("dataset");
    return useWorkspaceStore
      .getState()
      .loadDatasetFromFile(makeCsvFile(VALID_CSV))
      .then(() => {
        const state = useWorkspaceStore.getState();
        expect(state.datasetError).toBeNull();
        expect(state.dataset?.columns).toEqual(["feature", "target"]);
        expect(state.dataset?.rows).toHaveLength(3);
        expect(state.perExampleLossErrors).toEqual([]);
        expect(state.activePerExampleLoss).not.toBeNull();
      });
  });

  it("loading an invalid CSV sets datasetError and leaves any previously loaded dataset alone", () => {
    useWorkspaceStore.getState().setMode("dataset");
    return useWorkspaceStore
      .getState()
      .loadDatasetFromFile(makeCsvFile(VALID_CSV))
      .then(() =>
        useWorkspaceStore
          .getState()
          .loadDatasetFromFile(makeCsvFile("feature,target\nabc,4\n", "bad.csv"))
          .then(() => {
            const state = useWorkspaceStore.getState();
            expect(state.datasetError).toMatch(/Row 1, column 'feature'/);
            expect(state.dataset?.columns).toEqual(["feature", "target"]); // the earlier good load, untouched
          }),
      );
  });

  it("loading a dataset with different columns nulls the per-example loss rather than pairing it with mismatched columns", () => {
    useWorkspaceStore.getState().setMode("dataset");
    return useWorkspaceStore
      .getState()
      .loadDatasetFromFile(makeCsvFile(VALID_CSV))
      .then(() =>
        useWorkspaceStore
          .getState()
          .loadDatasetFromFile(makeCsvFile("x1,y1\n1,2\n2,4\n", "different-columns.csv"))
          .then(() => {
            const state = useWorkspaceStore.getState();
            expect(state.dataset?.columns).toEqual(["x1", "y1"]);
            // The default per-example loss text references `feature`/`target`, which no
            // longer exist — must not silently keep running against the old columns.
            expect(state.activePerExampleLoss).toBeNull();
            expect(state.perExampleLossErrors.length).toBeGreaterThan(0);
          }),
      );
  });

  it("renaming primary variables while the per-example loss still uses the old names disables running rather than crashing", () => {
    useWorkspaceStore.getState().setMode("dataset");
    return useWorkspaceStore
      .getState()
      .loadDatasetFromFile(makeCsvFile(VALID_CSV))
      .then(() => {
        const before = useWorkspaceStore.getState();
        expect(before.activePerExampleLoss).not.toBeNull();

        // The default per-example loss text says "theta_0 * feature + theta_1".
        // Renaming away from theta_0/theta_1 immediately updates the (always
        // valid) rules/initial-values, but must null the per-example loss
        // rather than pairing a stale, old-named compiled loss with the new
        // primaryVariables (the exact crash this regression test guards).
        useWorkspaceStore.getState().setDatasetPrimaryVariableNames(["weight", "bias"]);
        const after = useWorkspaceStore.getState();

        expect(after.datasetPrimaryVariableNames).toEqual(["weight", "bias"]);
        expect(after.primaryVariables.map((v) => v.name)).toEqual(["weight", "bias"]);
        expect(after.activePerExampleLoss).toBeNull();
        expect(after.perExampleLossErrors.length).toBeGreaterThan(0);
        for (const rule of after.rules) expect(rule.sourceText).toContain("weight_next");

        // The presenter can now fix the per-example loss text to match, in
        // one further step, without renaming again.
        useWorkspaceStore.getState().setPerExampleLossSourceText("prediction = weight * feature + bias\nerror = prediction - target\nloss = error^2");
        const fixed = useWorkspaceStore.getState();
        expect(fixed.activePerExampleLoss).not.toBeNull();
        expect(fixed.perExampleLossErrors).toEqual([]);
      });
  });

  it("editing the per-example loss text against a missing column surfaces a specific compile error", () => {
    useWorkspaceStore.getState().setMode("dataset");
    return useWorkspaceStore
      .getState()
      .loadDatasetFromFile(makeCsvFile(VALID_CSV))
      .then(() => {
        useWorkspaceStore.getState().setPerExampleLossSourceText("loss = (theta_0 - y_true)^2");
        const state = useWorkspaceStore.getState();
        expect(state.perExampleLossErrors.some((e) => /Undefined variable 'y_true'/.test(e.message))).toBe(true);
      });
  });

  it("setBatchSize clamps to a minimum of 1", () => {
    useWorkspaceStore.getState().setBatchSize(-5);
    expect(useWorkspaceStore.getState().batchSize).toBe(1);
  });
});
