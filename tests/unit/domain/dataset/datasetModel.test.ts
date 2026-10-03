import { describe, expect, it } from "vitest";
import { modelParameterNames, resolveDatasetModel, type DatasetModelConfig } from "../../../../src/domain/dataset/datasetModel";

const SOURCE = {
  columns: ["hours", "passed", "score"],
  rows: [
    { hours: 1, passed: 0, score: 40 },
    { hours: 4, passed: 1, score: 75 },
    { hours: 6, passed: 1, score: 90 },
  ],
};

function config(overrides: Partial<DatasetModelConfig> = {}): DatasetModelConfig {
  return {
    sourceDataset: SOURCE,
    modelKind: "linear",
    inputColumn: "hours",
    targetColumn: "score",
    customSourceText: "prediction = a * x + c\nloss = (prediction - y)^2",
    customParameterNames: ["a", "c"],
    ...overrides,
  };
}

describe("modelParameterNames", () => {
  it("modelParameterNames_template_isWAndB", () => {
    expect(modelParameterNames("linear", ["a", "c"])).toEqual(["w", "b"]);
    expect(modelParameterNames("logistic", ["a", "c"])).toEqual(["w", "b"]);
  });

  it("modelParameterNames_custom_usesCustomNames", () => {
    expect(modelParameterNames("custom", ["a", "c"])).toEqual(["a", "c"]);
  });
});

describe("resolveDatasetModel", () => {
  it("resolveDatasetModel_linear_compilesAgainstMappedXAndY", () => {
    const model = resolveDatasetModel(config());
    expect(model.dataError).toBeNull();
    expect(model.formulaErrors).toEqual([]);
    expect(model.compiled).not.toBeNull();
    expect(model.dataset!.columns).toEqual(["x", "y"]);
    expect(model.primaryVariables.map((v) => v.name)).toEqual(["w", "b"]);
    expect(model.definesPrediction).toBe(true);
  });

  it("resolveDatasetModel_logisticWithNonBinaryTarget_reportsDataError", () => {
    const model = resolveDatasetModel(config({ modelKind: "logistic", targetColumn: "score" }));
    expect(model.dataError).toMatch(/0 or 1/);
    expect(model.compiled).toBeNull();
  });

  it("resolveDatasetModel_logisticWithBinaryTarget_compiles", () => {
    const model = resolveDatasetModel(config({ modelKind: "logistic", targetColumn: "passed" }));
    expect(model.dataError).toBeNull();
    expect(model.compiled).not.toBeNull();
  });

  it("resolveDatasetModel_custom_usesCustomTextNamesAndOriginalColumns", () => {
    const model = resolveDatasetModel(
      config({ modelKind: "custom", customSourceText: "prediction = a * hours + c\nloss = (prediction - score)^2" }),
    );
    expect(model.formulaErrors).toEqual([]);
    expect(model.primaryVariables.map((v) => v.name)).toEqual(["a", "c"]);
    expect(model.sourceText).toContain("a * hours");
  });

  it("resolveDatasetModel_customWithoutPrediction_compilesButCannotDraw", () => {
    const model = resolveDatasetModel(config({ modelKind: "custom", customSourceText: "loss = (a * x + c - y)^2" }));
    expect(model.compiled).not.toBeNull();
    expect(model.definesPrediction).toBe(false);
  });

  it("resolveDatasetModel_customWithError_reportsFormulaErrors", () => {
    const model = resolveDatasetModel(config({ modelKind: "custom", customSourceText: "loss = (a * nope - y)^2" }));
    expect(model.compiled).toBeNull();
    expect(model.formulaErrors.some((e) => /'nope'/.test(e.message))).toBe(true);
  });

  it("resolveDatasetModel_noDataset_nothingToCompile", () => {
    const model = resolveDatasetModel(config({ sourceDataset: null }));
    expect(model.dataset).toBeNull();
    expect(model.compiled).toBeNull();
    expect(model.dataError).toBeNull();
  });

  it("resolveDatasetModel_templateSourceText_isTheTemplate", () => {
    expect(resolveDatasetModel(config()).sourceText).toContain("prediction = w * x + b");
  });
});
