import type { ChangeEvent } from "react";
import { DEFAULT_SURFACE_BOUNDS } from "../domain/visualization/surfaceGeometry";
import { useWorkspaceStore } from "../state/workspaceStore";
import { CollapsiblePanel } from "./CollapsiblePanel";

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

  const handleChange = (field: "xMin" | "xMax" | "yMin" | "yMax") => (e: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(e.target.value);
    if (!Number.isFinite(parsed)) return;
    const next = { ...bounds, [field]: parsed };
    if (next.xMin >= next.xMax || next.yMin >= next.yMax) return; // keep a valid window — never commit an inverted range
    setSurfaceBounds(next);
  };

  return (
    <CollapsiblePanel title="View area">
      <div className="sim-settings-row">
        <label className="field-label" htmlFor="view-x-min">
          x range
        </label>
        <input id="view-x-min" className="parameter-number-input" type="text" inputMode="decimal" value={bounds.xMin} onChange={handleChange("xMin")} />
        <input className="parameter-number-input" type="text" inputMode="decimal" value={bounds.xMax} onChange={handleChange("xMax")} />
      </div>
      <div className="sim-settings-row">
        <label className="field-label" htmlFor="view-y-min">
          y range
        </label>
        <input id="view-y-min" className="parameter-number-input" type="text" inputMode="decimal" value={bounds.yMin} onChange={handleChange("yMin")} />
        <input className="parameter-number-input" type="text" inputMode="decimal" value={bounds.yMax} onChange={handleChange("yMax")} />
      </div>
      <button type="button" onClick={() => setSurfaceBounds(DEFAULT_SURFACE_BOUNDS)}>
        Reset to ±10
      </button>
    </CollapsiblePanel>
  );
}
