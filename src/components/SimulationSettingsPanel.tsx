import { useWorkspaceStore } from "../state/workspaceStore";

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
    <section className="panel">
      <h2>Simulation settings</h2>
      <div className="sim-settings-row">
        <label className="field-label" htmlFor="seed-input">
          Seed
        </label>
        <input
          id="seed-input"
          className="seed-input"
          type="number"
          step={1}
          value={seed}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (Number.isFinite(parsed)) setSeed(Math.trunc(parsed));
          }}
        />
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
        <input
          className="parameter-number-input"
          type="text"
          inputMode="decimal"
          value={noiseLevel}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (Number.isFinite(parsed)) setNoiseLevel(Math.max(0, parsed));
          }}
        />
      </div>
    </section>
  );
}
