import { DEFAULT_SURFACE_BOUNDS } from "../domain/visualization/surfaceGeometry";
import { useWorkspaceStore } from "../state/workspaceStore";
import { CollapsiblePanel } from "./CollapsiblePanel";
import { NumberInput } from "./NumberInput";

/**
 * Surface mode's 3D/contour view bounds (DESIGN.md §8) — lets the presenter
 * frame a loss function whose interesting landscape sits well inside or
 * well outside the default ±10 window (e.g. a curvature that only shows up
 * within ±0.001, or one that needs ±10,000 to see the minimum at all).
 * Purely a rendering-domain setting: per §9's table, it never stops or
 * resets a running simulation — only the drawn surface/contour and the 3D
 * camera framing change.
 */
export function ViewBoundsPanel() {
  const bounds = useWorkspaceStore((s) => s.surfaceBounds);
  const setSurfaceBounds = useWorkspaceStore((s) => s.setSurfaceBounds);

  const handleChange = (field: "xMin" | "xMax" | "yMin" | "yMax") => (value: number) => {
    const next = { ...bounds, [field]: value };
    if (next.xMin >= next.xMax || next.yMin >= next.yMax) return; // keep a valid window — never commit an inverted range
    setSurfaceBounds(next);
  };

  return (
    <CollapsiblePanel title="View area">
      <div className="sim-settings-row">
        <label className="field-label" htmlFor="view-x-min">
          x range
        </label>
        <NumberInput id="view-x-min" value={bounds.xMin} onValue={handleChange("xMin")} />
        <NumberInput value={bounds.xMax} onValue={handleChange("xMax")} />
      </div>
      <div className="sim-settings-row">
        <label className="field-label" htmlFor="view-y-min">
          y range
        </label>
        <NumberInput id="view-y-min" value={bounds.yMin} onValue={handleChange("yMin")} />
        <NumberInput value={bounds.yMax} onValue={handleChange("yMax")} />
      </div>
      <button type="button" onClick={() => setSurfaceBounds(DEFAULT_SURFACE_BOUNDS)}>
        Reset to ±10
      </button>
    </CollapsiblePanel>
  );
}
