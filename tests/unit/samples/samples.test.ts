import { describe, expect, it } from "vitest";
import { loadCsv } from "../../../src/domain/dataset/csv";
import { resolveDatasetModel } from "../../../src/domain/dataset/datasetModel";
import { SAMPLE_DATASETS } from "../../../src/samples";

const EXPECTED_ROWS: Record<string, number> = {
  "linear-regression": 100,
  "study-hours-pass": 80,
  "ice-cream-sales": 60,
};

describe("SAMPLE_DATASETS", () => {
  it.each(SAMPLE_DATASETS.map((s) => [s.id, s] as const))("sample_%s_loadsAndTrainsWithItsSuggestedModel", (id, sample) => {
    const { dataset, error } = loadCsv(sample.csvText, sample.csvText.length);
    expect(error).toBeNull();
    expect(dataset!.rows).toHaveLength(EXPECTED_ROWS[id]);
    expect(dataset!.columns).toEqual(expect.arrayContaining([sample.inputColumn, sample.targetColumn]));

    const model = resolveDatasetModel({
      sourceDataset: dataset,
      modelKind: sample.modelKind,
      inputColumn: sample.inputColumn,
      targetColumn: sample.targetColumn,
      customSourceText: "",
      customParameterNames: ["a", "c"],
    });
    expect(model.dataError).toBeNull();
    expect(model.compiled).not.toBeNull();
  });

  it("samples_haveUniqueIds", () => {
    expect(new Set(SAMPLE_DATASETS.map((s) => s.id)).size).toBe(SAMPLE_DATASETS.length);
  });
});
