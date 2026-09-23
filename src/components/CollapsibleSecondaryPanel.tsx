import type { ReactNode } from "react";
import { useWorkspaceStore } from "../state/workspaceStore";

interface Props {
  children: ReactNode;
}

/**
 * Wraps the right-hand contour/comparison panel (shared by surface and
 * dataset mode) with a collapse toggle: collapsing shrinks the panel's
 * grid column down to a slim tab at the right edge of the screen (via the
 * `--secondary-col-width` CSS variable App.tsx sets from
 * `secondaryPanelCollapsed`), freeing the center view's width without
 * losing the panel's contents — they're just hidden, not unmounted, so
 * re-expanding doesn't re-fetch or re-render anything from scratch.
 */
export function CollapsibleSecondaryPanel({ children }: Props) {
  const collapsed = useWorkspaceStore((s) => s.secondaryPanelCollapsed);
  const setCollapsed = useWorkspaceStore((s) => s.setSecondaryPanelCollapsed);

  return (
    <div className={`secondary-view ${collapsed ? "secondary-view-collapsed" : ""}`}>
      <button
        className="secondary-collapse-tab"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? "Expand panel" : "Collapse panel"}
      >
        {collapsed ? "◂" : "▸"}
      </button>
      <div className="secondary-view-content" style={collapsed ? { display: "none" } : undefined}>
        {children}
      </div>
    </div>
  );
}
