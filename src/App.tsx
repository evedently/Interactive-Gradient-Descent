import type { CSSProperties } from "react";
import { DatasetWorkspaceView } from "./components/DatasetWorkspaceView";
import { ModeToggle } from "./components/ModeToggle";
import { PersistencePanel } from "./components/PersistencePanel";
import { SurfaceWorkspaceView } from "./components/SurfaceWorkspaceView";
import { useWorkspaceStore } from "./state/workspaceStore";

const SECONDARY_COL_WIDTH_EXPANDED = "380px";
const SECONDARY_COL_WIDTH_COLLAPSED = "44px";

/** Routes between surface mode (the permanent default) and dataset mode (DESIGN.md §7/§18 Phase 7) — everything mode-specific lives in the two workspace views. */
export function App() {
  const mode = useWorkspaceStore((s) => s.mode);
  const secondaryPanelCollapsed = useWorkspaceStore((s) => s.secondaryPanelCollapsed);

  // Drives .app-layout's third grid column width (see index.css) — the
  // collapse toggle itself lives in CollapsibleSecondaryPanel, but only
  // the grid container can resize the column it sits in.
  const layoutStyle = {
    "--secondary-col-width": secondaryPanelCollapsed ? SECONDARY_COL_WIDTH_COLLAPSED : SECONDARY_COL_WIDTH_EXPANDED,
  } as CSSProperties;

  return (
    <div className="app-layout" style={layoutStyle}>
      <div className="workspace-mode-bar">
        <ModeToggle />
        <PersistencePanel />
      </div>
      {mode === "dataset" ? <DatasetWorkspaceView /> : <SurfaceWorkspaceView />}
    </div>
  );
}
