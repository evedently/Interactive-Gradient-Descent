import { describe, expect, it } from "vitest";
import { defaultColumnsFor, mapDatasetColumns } from "../../../../src/domain/dataset/columnMapping";

const SOURCE = {
  columns: ["house size", "rooms", "price"],
  rows: [
    { "house size": 1200, rooms: 3, price: 250 },
    { "house size": 800, rooms: 2, price: 180 },
  ],
};

describe("mapDatasetColumns", () => {
  it("mapDatasetColumns_validColumns_renamesToXAndY", () => {
    const { dataset, error } = mapDatasetColumns(SOURCE, "house size", "price", false);
    expect(error).toBeNull();
    expect(dataset!.columns).toEqual(["x", "y"]);
    expect(dataset!.rows[0]).toEqual({ x: 1200, y: 250 });
  });

  it("mapDatasetColumns_keepOriginals_addsOnlyIdentifierColumns", () => {
    const { dataset } = mapDatasetColumns(SOURCE, "house size", "price", true);
    expect(dataset!.columns).toEqual(["x", "y", "rooms", "price"]);
    expect(dataset!.rows[1]).toEqual({ x: 800, y: 180, rooms: 2, price: 180 });
  });

  it("mapDatasetColumns_originalColumnsNamedXOrY_areShadowedByMapping", () => {
    const source = { columns: ["y", "x"], rows: [{ y: 1, x: 2 }] };
    const { dataset } = mapDatasetColumns(source, "y", "x", true);
    expect(dataset!.columns).toEqual(["x", "y"]);
    expect(dataset!.rows[0]).toEqual({ x: 1, y: 2 });
  });

  it("mapDatasetColumns_missingColumn_reportsError", () => {
    const { dataset, error } = mapDatasetColumns(SOURCE, "area", "price", false);
    expect(dataset).toBeNull();
    expect(error).toMatch(/'area'/);
  });

  it("mapDatasetColumns_sameInputAndTarget_reportsError", () => {
    expect(mapDatasetColumns(SOURCE, "price", "price", false).error).toMatch(/different/);
  });

  it("mapDatasetColumns_unselectedColumns_reportsError", () => {
    expect(mapDatasetColumns(SOURCE, null, "price", false).error).toMatch(/Choose/);
  });
});

describe("defaultColumnsFor", () => {
  it("defaultColumnsFor_noPrevious_firstAndLastColumns", () => {
    expect(defaultColumnsFor(SOURCE.columns, null, null)).toEqual({ input: "house size", target: "price" });
  });

  it("defaultColumnsFor_previousStillPresent_keepsThem", () => {
    expect(defaultColumnsFor(SOURCE.columns, "rooms", "price")).toEqual({ input: "rooms", target: "price" });
  });

  it("defaultColumnsFor_singleColumn_nulls", () => {
    expect(defaultColumnsFor(["only"], null, null)).toEqual({ input: null, target: null });
  });
});
