import { useRef, useState } from "react";
import { downloadTextFile } from "../lib/downloadFile";
import { useWorkspaceStore } from "../state/workspaceStore";

/**
 * Workspace save/load (DESIGN.md §16/§18 Phase 8): mode-agnostic, so it
 * lives at the App level rather than inside either workspace view.
 * "Save" downloads the current workspace as schema-versioned JSON;
 * "Load" reads a previously saved file back through
 * `loadWorkspaceSnapshot`, which re-validates and re-compiles everything
 * before replacing the workspace atomically — a rejected file leaves the
 * current workspace untouched.
 */
export function PersistencePanel() {
  const exportSnapshot = useWorkspaceStore((s) => s.exportSnapshot);
  const loadWorkspaceSnapshot = useWorkspaceStore((s) => s.loadWorkspaceSnapshot);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleSave = () => {
    const snapshot = exportSnapshot();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadTextFile(`gradient-descent-workspace-${timestamp}.json`, JSON.stringify(snapshot, null, 2), "application/json");
  };

  const handleLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const { errors } = loadWorkspaceSnapshot(parsed);
      setLoadError(errors.length > 0 ? errors.join("; ") : null);
    } catch {
      setLoadError("File is not valid JSON");
    }
  };

  return (
    <div className="persistence-panel">
      <button onClick={handleSave} title="Download this workspace as a JSON file">
        Save workspace
      </button>
      <button onClick={() => fileInputRef.current?.click()} title="Load a previously saved workspace JSON file">
        Load workspace
      </button>
      <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleLoad} style={{ display: "none" }} />
      {loadError ? <span className="persistence-error">{loadError}</span> : null}
    </div>
  );
}
