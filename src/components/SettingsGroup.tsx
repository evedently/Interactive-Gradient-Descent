import type { ReactNode } from "react";
import { CollapsiblePanel } from "./CollapsiblePanel";

/** Umbrella "Settings" section holding the workspace-wide panels (loss, simulation, view area, run controls), so they can all be folded away at once to give the rule list room. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <CollapsiblePanel title="Settings" className="settings-group">
      {children}
    </CollapsiblePanel>
  );
}
