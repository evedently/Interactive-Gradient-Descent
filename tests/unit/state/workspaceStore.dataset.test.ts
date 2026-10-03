import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES, useWorkspaceStore } from "../../../src/state/workspaceStore";

function makeCsvFile(text: string, name = "data.csv"): File {
  return new File([text], name, { type: "text/csv" });
}

const VALID_CSV = "feature,target\n1,2\n2,4\n3,6\n";
const BINARY_CSV = "hours,score,passed\n1,40,0\n2,55,0\n4,70,1\n6,90,1\n";

const store = () => useWorkspaceStore.getState();
const names = () => store().primaryVariables.map((v) => v.name);

describe("workspaceStore: dataset mode", () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  });

  it("defaults to surface mode with the fixed x/y primary variables", () => {
    expect(store().mode).toBe("surface");
    expect(names()).toEqual(["x", "y"]);
  });

  it("setMode_dataset_adoptsLinearTemplateParametersAndRegeneratesRules", () => {
    store().setMode("dataset");
    expect(store().modelKind).toBe("linear");
    expect(names()).toEqual(["w", "b"]);
    expect(store().datasetInitialValues).toEqual({ w: 0, b: 0 });
    for (const rule of store().rules) {
      expect(rule.errors).toEqual([]);
      expect(rule.sourceText).toContain("w_next");
    }
  });

  it("setMode_dataset_keepsEachRulesOwnLogicRenamedToWAndB", () => {
    const [momentum] = store().rules;
    store().setMode("dataset");
    const translated = store().rules[0];
    expect(translated.id).toBe(momentum.id);
    expect(translated.sourceText).toContain("parameter beta");
    expect(translated.sourceText).toContain("w_next = w + vx_next");
    expect(translated.errors).toEqual([]);
  });

  it("setMode_handWrittenRule_survivesARoundTrip", () => {
    const [rule] = store().rules;
    const custom = "parameter eta = 0.05 range 0.0001 to 1 log\nx_next = x - eta * gx * 2\ny_next = y - eta * gy";
    store().setRuleSourceText(rule.id, custom);
    store().setMode("dataset");
    expect(store().rules[0].sourceText).toBe("parameter eta = 0.05 range 0.0001 to 1 log\nw_next = w - eta * gw * 2\nb_next = b - eta * gb");
    store().setMode("surface");
    expect(store().rules[0].sourceText).toBe(custom);
    expect(store().rules[0].errors).toEqual([]);
  });

  it("setMode_backToSurface_restoresXAndYRules", () => {
    store().setMode("dataset");
    store().setMode("surface");
    expect(names()).toEqual(["x", "y"]);
    for (const rule of store().rules) expect(rule.sourceText).toContain("x_next");
  });

  describe("loading data", () => {
    beforeEach(() => store().setMode("dataset"));

    it("loadDatasetFromFile_validCsv_mapsFirstAndLastColumnsAndCompilesLinear", async () => {
      await store().loadDatasetFromFile(makeCsvFile(VALID_CSV));
      const state = store();
      expect(state.datasetError).toBeNull();
      expect(state.sourceDataset?.columns).toEqual(["feature", "target"]);
      expect(state).toMatchObject({ inputColumn: "feature", targetColumn: "target" });
      expect(state.dataset?.columns).toEqual(["x", "y"]);
      expect(state.dataset?.rows[0]).toEqual({ x: 1, y: 2 });
      expect(state.activePerExampleLoss).not.toBeNull();
      expect(state.modelDefinesPrediction).toBe(true);
    });

    it("loadDatasetFromFile_invalidCsv_setsErrorAndKeepsPreviousDataset", async () => {
      await store().loadDatasetFromFile(makeCsvFile(VALID_CSV));
      await store().loadDatasetFromFile(makeCsvFile("feature,target\nabc,4\n", "bad.csv"));
      expect(store().datasetError).toMatch(/Row 1, column 'feature'/);
      expect(store().sourceDataset?.columns).toEqual(["feature", "target"]);
      expect(store().activePerExampleLoss).not.toBeNull();
    });

    it("loadDatasetFromFile_differentColumns_remapsToNewColumns", async () => {
      await store().loadDatasetFromFile(makeCsvFile(VALID_CSV));
      await store().loadDatasetFromFile(makeCsvFile("x1,y1\n1,2\n2,4\n", "different-columns.csv"));
      expect(store()).toMatchObject({ inputColumn: "x1", targetColumn: "y1" });
      expect(store().activePerExampleLoss).not.toBeNull();
    });

    it("loadDatasetFromFile_previousColumnsStillPresent_keepsColumnChoice", async () => {
      await store().loadDatasetFromFile(makeCsvFile(BINARY_CSV));
      store().setColumnMapping("hours", "score");
      await store().loadDatasetFromFile(makeCsvFile(BINARY_CSV, "again.csv"));
      expect(store()).toMatchObject({ inputColumn: "hours", targetColumn: "score" });
    });

    it("loadDatasetFromText_withPreset_appliesModelAndColumns", () => {
      store().loadDatasetFromText(BINARY_CSV, "pass.csv", { modelKind: "logistic", inputColumn: "hours", targetColumn: "passed" });
      expect(store()).toMatchObject({ modelKind: "logistic", inputColumn: "hours", targetColumn: "passed", datasetFileName: "pass.csv" });
      expect(store().modelDataError).toBeNull();
      expect(store().activePerExampleLoss).not.toBeNull();
    });
  });

  describe("model choice", () => {
    beforeEach(async () => {
      store().setMode("dataset");
      await store().loadDatasetFromFile(makeCsvFile(BINARY_CSV));
    });

    it("setModelKind_logisticWithNonBinaryTarget_reportsDataErrorAndDisablesTraining", () => {
      store().setColumnMapping("hours", "score");
      store().setModelKind("logistic");
      expect(store().modelDataError).toMatch(/0 or 1/);
      expect(store().activePerExampleLoss).toBeNull();
    });

    it("setColumnMapping_toBinaryTarget_fixesLogistic", () => {
      store().setModelKind("logistic");
      store().setColumnMapping("hours", "passed");
      expect(store().modelDataError).toBeNull();
      expect(store().activePerExampleLoss).not.toBeNull();
    });

    it("setModelKind_betweenTemplates_keepsRuleText", () => {
      const before = store().rules;
      store().setModelKind("logistic");
      expect(store().rules).toBe(before);
      expect(names()).toEqual(["w", "b"]);
    });

    it("setModelKind_custom_adoptsCustomParameterNamesAndRegeneratesRules", () => {
      store().setModelKind("custom");
      expect(names()).toEqual(DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES);
      expect(store().activePerExampleLoss).not.toBeNull();
      for (const rule of store().rules) expect(rule.sourceText).toContain("theta_0_next");
    });

    it("customizeTemplate_copiesTemplateTextWithWAndB", () => {
      store().setModelKind("logistic");
      store().setColumnMapping("hours", "passed");
      const rulesBefore = store().rules;
      store().customizeTemplate();
      expect(store().modelKind).toBe("custom");
      expect(store().perExampleLossSourceText).toContain("prediction = 1 / (1 + exp(-z))");
      expect(store().datasetPrimaryVariableNames).toEqual(["w", "b"]);
      expect(store().activePerExampleLoss).not.toBeNull();
      expect(store().rules).toBe(rulesBefore);
    });
  });

  describe("custom formulas", () => {
    beforeEach(async () => {
      store().setMode("dataset");
      await store().loadDatasetFromFile(makeCsvFile(VALID_CSV));
      store().setModelKind("custom");
    });

    it("setDatasetPrimaryVariableNames_custom_regeneratesRulesAndRekeysInitialValues", () => {
      store().setDatasetPrimaryVariableNames(["weight", "bias"]);
      expect(names()).toEqual(["weight", "bias"]);
      expect(store().datasetInitialValues).toEqual({ weight: 0, bias: 0 });
      for (const rule of store().rules) expect(rule.sourceText).toContain("weight_next");
    });

    it("setDatasetPrimaryVariableNames_formulaStillUsesOldNames_disablesTrainingRatherThanCrashing", () => {
      store().setDatasetPrimaryVariableNames(["weight", "bias"]);
      expect(store().activePerExampleLoss).toBeNull();
      expect(store().perExampleLossErrors.length).toBeGreaterThan(0);

      store().setPerExampleLossSourceText("prediction = weight * x + bias\nerror = prediction - y\nloss = error^2");
      expect(store().activePerExampleLoss).not.toBeNull();
      expect(store().perExampleLossErrors).toEqual([]);
    });

    it("setPerExampleLossSourceText_originalColumnNames_compile", () => {
      store().setPerExampleLossSourceText("prediction = theta_0 * feature + theta_1\nloss = (prediction - target)^2");
      expect(store().perExampleLossErrors).toEqual([]);
      expect(store().activePerExampleLoss).not.toBeNull();
    });

    it("setPerExampleLossSourceText_missingColumn_reportsSpecificError", () => {
      store().setPerExampleLossSourceText("loss = (theta_0 - y_true)^2");
      expect(store().perExampleLossErrors.some((e) => /Undefined variable 'y_true'/.test(e.message))).toBe(true);
    });

    it("setPerExampleLossSourceText_typo_keepsLastCompiledFormula", () => {
      const before = store().activePerExampleLoss;
      store().setPerExampleLossSourceText("prediction = theta_0 * x +");
      expect(store().perExampleLossErrors.length).toBeGreaterThan(0);
      expect(store().activePerExampleLoss).toBe(before);
    });

    it("setPerExampleLossSourceText_withoutPrediction_trainsButCannotDraw", () => {
      store().setPerExampleLossSourceText("loss = (theta_0 * x + theta_1 - y)^2");
      expect(store().activePerExampleLoss).not.toBeNull();
      expect(store().modelDefinesPrediction).toBe(false);
    });
  });

  it("setDatasetPrimaryVariableNames_inSurfaceMode_leavesLiveRulesAlone", () => {
    const before = store().rules;
    store().setDatasetPrimaryVariableNames(["weight", "bias"]);
    expect(store().rules).toBe(before);
    expect(names()).toEqual(["x", "y"]);
  });

  it("setFocusedRuleIdAndParameterHover_storeViewState", () => {
    store().setFocusedRuleId("abc");
    store().setParameterHover({ w: 1, b: 2 });
    store().setPredictInput(3.5);
    expect(store()).toMatchObject({ focusedRuleId: "abc", parameterHover: { w: 1, b: 2 }, predictInput: 3.5 });
  });

  it("setBatchSize clamps to a minimum of 1", () => {
    store().setBatchSize(-5);
    expect(store().batchSize).toBe(1);
  });
});
