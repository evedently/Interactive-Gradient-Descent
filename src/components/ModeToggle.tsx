import type { WorkspaceMode } from "../state/workspaceStore";
import { useWorkspaceStore } from "../state/workspaceStore";

/** Surface (the permanent default) vs. dataset mode (DESIGN.md §7/§18 Phase 7). Switching regenerates every rule's text against the target mode's primary variables — see `regenerateRulesForPrimaryVariables`. */
export function ModeToggle() {
  const mode = useWorkspaceStore((s) => s.mode);
  const setMode = useWorkspaceStore((s) => s.setMode);

  const select = (next: WorkspaceMode) => {
    if (next !== mode) setMode(next);
  };

  return (
    <div className="mode-toggle">
      <button className={mode === "surface" ? "active" : ""} onClick={() => select("surface")}>
        Surface
      </button>
      <button className={mode === "dataset" ? "active" : ""} onClick={() => select("dataset")}>
        Dataset
      </button>
    </div>
  );
}
