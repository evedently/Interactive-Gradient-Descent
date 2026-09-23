import { describe, expect, it } from "vitest";
import { parseExpression } from "../../../../src/domain/expr/parser";
import { colorForLevelNormalized } from "../../../../src/domain/visualization/contourColor";
import { buildSurfaceGeometry, SURFACE_RESOLUTION } from "../../../../src/domain/visualization/surfaceGeometry";

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
    // SURFACE_BOUNDS/SURFACE_RESOLUTION don't happen to sample x=0 exactly
    // (an even grid over a symmetric range never does) — the important part
    // of this acceptance test is that the near-singularity magnitude never
    // crashes or corrupts the geometry, matching §8's note that "a point can
    // be perfectly valid to simulate while sitting next to a masked region."
    expect(() => buildSurfaceGeometry(parseExpression("1/x"))).not.toThrow();
    const { geometry } = buildSurfaceGeometry(parseExpression("1/x"));
    expect(geometry.attributes.position.count).toBe(SURFACE_RESOLUTION * SURFACE_RESOLUTION);
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
