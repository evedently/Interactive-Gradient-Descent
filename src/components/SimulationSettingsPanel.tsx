import { useWorkspaceStore } from "../state/workspaceStore";
import { CollapsiblePanel } from "./CollapsiblePanel";
import { NumberInput } from "./NumberInput";

const MAX_NOISE = 5;

/**
 * Workspace-level settings shared by every rule (DESIGN.md §1/§10):
 * the random seed (default 42, editable) and the gradient-noise slider.
 * Changing the seed only takes effect on that rule's next Reset (DESIGN.md
 * §9 — mid-run reseeding would be neither the old nor the new sequence);
 * the noise level takes effect on the next step, like a parameter.
 */
export function SimulationSettingsPanel() {
  const seed = useWorkspaceStore((s) => s.seed);
  const noiseLevel = useWorkspaceStore((s) => s.noiseLevel);
  const setSeed = useWorkspaceStore((s) => s.setSeed);
  const setNoiseLevel = useWorkspaceStore((s) => s.setNoiseLevel);

  return (
    <CollapsiblePanel title="Simulation settings">
      <div className="sim-settings-row">
        <label className="field-label" htmlFor="seed-input">
          Seed
        </label>
        <NumberInput id="seed-input" className="seed-input" type="number" step={1} value={seed} onValue={(value) => setSeed(Math.trunc(value))} />
        <span className="field-hint">applies on each rule's next Reset</span>
      </div>
      <div className="sim-settings-row">
        <label className="field-label" htmlFor="noise-input">
          Noise
        </label>
        <input
          id="noise-input"
          type="range"
          min={0}
          max={MAX_NOISE}
          step={0.01}
          value={noiseLevel}
          onChange={(e) => setNoiseLevel(Number(e.target.value))}
        />
        <NumberInput value={noiseLevel} onValue={(value) => setNoiseLevel(Math.max(0, value))} />
      </div>
    </CollapsiblePanel>
  );
}
