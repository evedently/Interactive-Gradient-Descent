import { describe, expect, it } from "vitest";
import { parseExpression } from "../../../../src/domain/expr/parser";
import { colorForLevelNormalized } from "../../../../src/domain/visualization/contourColor";
import {
  buildGeometryInView,
  buildSurfaceGeometry,
  DEFAULT_SURFACE_BOUNDS,
  SURFACE_RESOLUTION,
  surfaceViewTransformFor,
} from "../../../../src/domain/visualization/surfaceGeometry";

describe("buildSurfaceGeometry", () => {
  it("produces a full grid of vertices and a full grid of triangles for a smooth function", () => {
    const { geometry } = buildSurfaceGeometry(parseExpression("(x - 3)^2 + 4*(y + 1)^2"));
    expect(geometry.attributes.position.count).toBe(SURFACE_RESOLUTION * SURFACE_RESOLUTION);
    const expectedTriangles = (SURFACE_RESOLUTION - 1) * (SURFACE_RESOLUTION - 1) * 2;
    expect(geometry.getIndex()!.count / 3).toBe(expectedTriangles);
  });

  it("omits triangles touching a masked (non-finite) grid cell", () => {
    const { geometry } = buildSurfaceGeometry(parseExpression("sqrt(x)"));
    const expectedTriangles = (SURFACE_RESOLUTION - 1) * (SURFACE_RESOLUTION - 1) * 2;
    expect(geometry.getIndex()!.count / 3).toBeLessThan(expectedTriangles);
  });

  it("acceptance test #13 (DESIGN.md §19): renders a ln(x) domain gap without crashing, masking rather than clamping", () => {
    expect(() => buildSurfaceGeometry(parseExpression("ln(x)"))).not.toThrow();
    const { geometry } = buildSurfaceGeometry(parseExpression("ln(x)"));
    const expectedTriangles = (SURFACE_RESOLUTION - 1) * (SURFACE_RESOLUTION - 1) * 2;
    expect(geometry.getIndex()!.count / 3).toBeLessThan(expectedTriangles);
    expect(geometry.getIndex()!.count).toBeGreaterThan(0); // the valid half of the surface still renders
  });

  it("acceptance test #13 (DESIGN.md §19): renders a 1/x domain gap around the singularity without crashing", () => {
    // DEFAULT_SURFACE_BOUNDS/SURFACE_RESOLUTION don't happen to sample x=0 exactly
    // (an even grid over a symmetric range never does) — the important part
    // of this acceptance test is that the near-singularity magnitude never
    // crashes or corrupts the geometry, matching §8's note that "a point can
    // be perfectly valid to simulate while sitting next to a masked region."
    expect(() => buildSurfaceGeometry(parseExpression("1/x"))).not.toThrow();
    const { geometry } = buildSurfaceGeometry(parseExpression("1/x"));
    expect(geometry.attributes.position.count).toBe(SURFACE_RESOLUTION * SURFACE_RESOLUTION);
  });

  it("samples over a presenter-supplied view window instead of the default ±10, and still fills the SAME fixed visual footprint (±10) so a landscape that only varies at a much smaller or larger scale is actually visible, not an invisible speck or an oversized plane", () => {
    const tinyBounds = { xMin: -0.001, xMax: 0.001, yMin: -0.001, yMax: 0.001 };
    const { geometry } = buildSurfaceGeometry(parseExpression("(x - 3)^2 + 4*(y + 1)^2"), tinyBounds);
    const positions = geometry.attributes.position;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      minX = Math.min(minX, positions.getX(i));
      maxX = Math.max(maxX, positions.getX(i));
      // Every vertex still lands within the same ~±10 visual footprint the default bounds use.
      expect(Math.abs(positions.getX(i))).toBeLessThanOrEqual(10.001);
      expect(Math.abs(positions.getZ(i))).toBeLessThanOrEqual(10.001);
    }
    // And it actually spans that footprint (not collapsed to a point) — the whole reason for the transform.
    expect(maxX - minX).toBeGreaterThan(15);
  });

  it("at the default ±10 bounds, the view transform is the identity — no change from the original always-±10 behavior", () => {
    const { geometry: defaultGeom } = buildSurfaceGeometry(parseExpression("(x - 3)^2 + 4*(y + 1)^2"));
    const { geometry: explicitGeom } = buildSurfaceGeometry(parseExpression("(x - 3)^2 + 4*(y + 1)^2"), DEFAULT_SURFACE_BOUNDS);
    expect(Array.from(explicitGeom.attributes.position.array)).toEqual(Array.from(defaultGeom.attributes.position.array));
  });

  it("colors the lowest vertex with the ramp's t=0 color and the highest with its t=1 color", () => {
    const { geometry, min, max } = buildSurfaceGeometry(parseExpression("(x - 3)^2 + 4*(y + 1)^2"));
    const colorAttr = geometry.attributes.color;
    expect(colorAttr).toBeDefined();
    expect(colorAttr.count).toBe(SURFACE_RESOLUTION * SURFACE_RESOLUTION);

    const positions = geometry.attributes.position;
    let minIndex = 0;
    let maxIndex = 0;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) < positions.getY(minIndex)) minIndex = i;
      if (positions.getY(i) > positions.getY(maxIndex)) maxIndex = i;
    }
    expect(min).toBeLessThan(max);
    const lowColor = colorForLevelNormalized(0);
    const highColor = colorForLevelNormalized(1);
    expect([colorAttr.getX(minIndex), colorAttr.getY(minIndex), colorAttr.getZ(minIndex)].map((c) => Number(c.toFixed(4)))).toEqual(
      lowColor.map((c) => Number(c.toFixed(4))),
    );
    expect([colorAttr.getX(maxIndex), colorAttr.getY(maxIndex), colorAttr.getZ(maxIndex)].map((c) => Number(c.toFixed(4)))).toEqual(
      highColor.map((c) => Number(c.toFixed(4))),
    );
  });
});

describe("surfaceViewTransformFor", () => {
  it("is the identity at the default ±10 bounds", () => {
    const t = surfaceViewTransformFor(DEFAULT_SURFACE_BOUNDS);
    expect(t.toVisualX(3)).toBeCloseTo(3, 9);
    expect(t.toVisualZ(-1)).toBeCloseTo(-1, 9);
    expect(t.scaleX).toBeCloseTo(1, 9);
    expect(t.scaleZ).toBeCloseTo(1, 9);
    expect(t.centerX).toBe(0);
    expect(t.centerZ).toBe(0);
  });

  it("maps a much smaller view window onto the same fixed ±10 visual footprint", () => {
    const t = surfaceViewTransformFor({ xMin: -0.001, xMax: 0.001, yMin: -0.001, yMax: 0.001 });
    expect(t.toVisualX(-0.001)).toBeCloseTo(-10, 9);
    expect(t.toVisualX(0.001)).toBeCloseTo(10, 9);
    expect(t.toVisualX(0)).toBeCloseTo(0, 9);
  });

  it("maps a much larger view window onto the same fixed ±10 visual footprint", () => {
    const t = surfaceViewTransformFor({ xMin: -10_000, xMax: 10_000, yMin: -10_000, yMax: 10_000 });
    expect(t.toVisualX(-10_000)).toBeCloseTo(-10, 9);
    expect(t.toVisualX(10_000)).toBeCloseTo(10, 9);
  });

  it("centers an off-center (asymmetric) window on the visual origin, not literal (0,0)", () => {
    const t = surfaceViewTransformFor({ xMin: 0, xMax: 20, yMin: 0, yMax: 20 });
    expect(t.centerX).toBe(10);
    expect(t.toVisualX(10)).toBeCloseTo(0, 9); // the window's own center maps to the visual origin
    expect(t.toVisualX(0)).toBeCloseTo(-10, 9);
    expect(t.toVisualX(20)).toBeCloseTo(10, 9);
  });

  it("scales x and y independently when their spans differ, matching ContourPlot2D's own non-uniform canvas mapping", () => {
    const t = surfaceViewTransformFor({ xMin: -10, xMax: 10, yMin: -1000, yMax: 1000 });
    expect(t.scaleX).toBeCloseTo(1, 9);
    expect(t.scaleZ).toBeCloseTo(0.01, 9);
  });

  it("toRawX/toRawZ invert toVisualX/toVisualZ", () => {
    const t = surfaceViewTransformFor({ xMin: -3, xMax: 7, yMin: 100, yMax: 200 });
    for (const x of [-3, 0, 4.5, 7]) expect(t.toRawX(t.toVisualX(x))).toBeCloseTo(x, 9);
    for (const y of [100, 150, 200]) expect(t.toRawZ(t.toVisualZ(y))).toBeCloseTo(y, 9);
  });
});

describe("buildGeometryInView", () => {
  function gridOver(bounds: { xMin: number; xMax: number; yMin: number; yMax: number }, resolution = 5) {
    const xs = Float64Array.from({ length: resolution }, (_, i) => bounds.xMin + ((bounds.xMax - bounds.xMin) * i) / (resolution - 1));
    const ys = Float64Array.from({ length: resolution }, (_, i) => bounds.yMin + ((bounds.yMax - bounds.yMin) * i) / (resolution - 1));
    const values = Float64Array.from({ length: resolution * resolution }, (_, i) => i);
    return { resolution, xs, ys, values };
  }

  it("buildGeometryInView_hugeParameterWindow_staysInFixedVisualFootprint", () => {
    const bounds = { xMin: -60_000, xMax: 40_000, yMin: 1_000, yMax: 3_000 };
    const { geometry } = buildGeometryInView(gridOver(bounds), surfaceViewTransformFor(bounds));
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.abs(positions[i])).toBeLessThanOrEqual(10 + 1e-6);
      expect(Math.abs(positions[i + 2])).toBeLessThanOrEqual(10 + 1e-6);
    }
  });

  it("buildGeometryInView_defaultWindow_identity", () => {
    const { geometry } = buildGeometryInView(gridOver(DEFAULT_SURFACE_BOUNDS), surfaceViewTransformFor(DEFAULT_SURFACE_BOUNDS));
    const positions = geometry.attributes.position.array as Float32Array;
    expect(positions[0]).toBeCloseTo(-10);
    expect(positions[2]).toBeCloseTo(-10);
  });
});
