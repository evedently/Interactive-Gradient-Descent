import { describe, expect, it } from "vitest";
import { CSV_EMBED_REFUSE_BYTES, CSV_EMBED_WARN_BYTES, loadCsv } from "../../../../src/domain/dataset/csv";

describe("loadCsv", () => {
  it("loads a simple numeric CSV into columns and rows", () => {
    const csv = "feature,target\n1,2\n2,4\n3,6\n";
    const { dataset, error, warning } = loadCsv(csv, csv.length);
    expect(error).toBeNull();
    expect(warning).toBeNull();
    expect(dataset?.columns).toEqual(["feature", "target"]);
    expect(dataset?.rows).toEqual([
      { feature: 1, target: 2 },
      { feature: 2, target: 4 },
      { feature: 3, target: 6 },
    ]);
  });

  it("rejects a CSV with no header/columns", () => {
    const { dataset, error } = loadCsv("", 0);
    expect(dataset).toBeNull();
    expect(error).toMatch(/no columns/);
  });

  it("rejects a header-only CSV with no data rows", () => {
    const { dataset, error } = loadCsv("feature,target\n", 14);
    expect(dataset).toBeNull();
    expect(error).toMatch(/no data rows/);
  });

  it("rejects a non-numeric cell with the specific row and column", () => {
    const csv = "feature,target\n1,2\nabc,4\n";
    const { dataset, error } = loadCsv(csv, csv.length);
    expect(dataset).toBeNull();
    expect(error).toMatch(/Row 2, column 'feature'/);
  });

  it("rejects a missing cell (short row) with the specific row and column", () => {
    const csv = "feature,target\n1,2\n3\n";
    const { dataset, error } = loadCsv(csv, csv.length);
    expect(dataset).toBeNull();
    expect(error).toMatch(/Row 2, column 'target'/);
  });

  it("warns above the ~2MB embed threshold but still loads", () => {
    const csv = "feature,target\n1,2\n";
    const { dataset, error, warning } = loadCsv(csv, CSV_EMBED_WARN_BYTES + 1);
    expect(error).toBeNull();
    expect(dataset).not.toBeNull();
    expect(warning).toMatch(/2\.0 MB/);
  });

  it("refuses above the ~25MB embed limit and does not parse", () => {
    const csv = "feature,target\n1,2\n";
    const { dataset, error, warning } = loadCsv(csv, CSV_EMBED_REFUSE_BYTES + 1);
    expect(dataset).toBeNull();
    expect(warning).toBeNull();
    expect(error).toMatch(/exceeds the 25 MB embed limit/);
  });
});
