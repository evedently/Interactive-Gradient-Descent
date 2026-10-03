import { describe, expect, it } from "vitest";
import { canvasTransform, contourLevels } from "../../../../src/domain/visualization/canvasTransform";

const BOUNDS = { xMin: -10, xMax: 10, yMin: -5, yMax: 5 };
const SIZE = 400;

describe("canvasTransform", () => {
  const t = canvasTransform(BOUNDS, SIZE);

  it("toCanvas_boundsCorners_mapToCanvasCornersWithYFlipped", () => {
    expect(t.toCanvas(-10, -5)).toEqual({ px: 0, py: SIZE });
    expect(t.toCanvas(10, 5)).toEqual({ px: SIZE, py: 0 });
  });

  it("toCanvas_center_mapsToCanvasCenter", () => {
    expect(t.toCanvas(0, 0)).toEqual({ px: SIZE / 2, py: SIZE / 2 });
  });

  it("fromCanvas_roundTripsToCanvas", () => {
    const { px, py } = t.toCanvas(3.5, -1.25);
    const back = t.fromCanvas(px, py);
    expect(back.x).toBeCloseTo(3.5);
    expect(back.y).toBeCloseTo(-1.25);
  });

  it("fromCanvas_outsideCanvas_clampsToBounds", () => {
    expect(t.fromCanvas(-50, SIZE + 50)).toEqual({ x: -10, y: -5 });
    expect(t.fromCanvas(SIZE + 50, -50)).toEqual({ x: 10, y: 5 });
  });
});

describe("canvasTransform (non-square)", () => {
  const t = canvasTransform(BOUNDS, 400, 200);

  it("toCanvas_nonSquare_scalesEachAxisToItsOwnSize", () => {
    expect(t.toCanvas(10, -5)).toEqual({ px: 400, py: 200 });
    expect(t.toCanvas(0, 0)).toEqual({ px: 200, py: 100 });
  });

  it("fromCanvas_nonSquare_clampsEachAxisToItsOwnSize", () => {
    expect(t.fromCanvas(500, 300)).toEqual({ x: 10, y: -5 });
  });
});

describe("contourLevels", () => {
  it("contourLevels_evenlySpacedFromMin", () => {
    expect(contourLevels(0, 10, 5)).toEqual([0, 2, 4, 6, 8]);
  });

  it("contourLevels_offsetMin_shiftsEveryLevel", () => {
    expect(contourLevels(-4, 8, 4)).toEqual([-4, -2, 0, 2]);
  });
});
