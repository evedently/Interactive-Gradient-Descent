import type { ChangeEvent } from "react";
import { useWorkspaceStore } from "../state/workspaceStore";
import { CollapsiblePanel } from "./CollapsiblePanel";

const MIN_STEPS_PER_SECOND = 0.5;
const MAX_STEPS_PER_SECOND = 60;

function parseOptionalPositiveNumber(raw: string): number | undefined | null {
  if (raw.trim() === "") return undefined; // explicitly cleared -> uncapped/disabled
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null; // null = invalid, ignore
}

/**
 * Global run controls (never per-rule, DESIGN.md §12/§17): the simulation
 * speed every rule steps at, the two genuine divergence bounds, and the two
 * opt-in stopping criteria (iteration cap, early-stop loss threshold).
 * Shared workspace-wide state — changes take effect on the very next step,
 * like a parameter, no reset needed.
 */
export function RunControlsPanel() {
  const stepsPerSecond = useWorkspaceStore((s) => s.stepsPerSecond);
  const setStepsPerSecond = useWorkspaceStore((s) => s.setStepsPerSecond);
  const simLimits = useWorkspaceStore((s) => s.simLimits);
  const setSimLimits = useWorkspaceStore((s) => s.setSimLimits);

  const handleOptionalChange = (field: "maxIterations" | "earlyStopLossThreshold") => (e: ChangeEvent<HTMLInputElement>) => {
    const parsed = parseOptionalPositiveNumber(e.target.value);
    if (parsed !== null) setSimLimits({ [field]: parsed });
  };

  return (
    <CollapsiblePanel title="Run controls">
      <div className="sim-settings-row">
        <label className="field-label" htmlFor="steps-per-second-input">
          Speed
        </label>
        <input
          id="steps-per-second-input"
          className="parameter-number-input"
          type="text"
          inputMode="decimal"
          value={stepsPerSecond}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (Number.isFinite(parsed) && parsed > 0) setStepsPerSecond(Math.min(MAX_STEPS_PER_SECOND, parsed));
          }}
        />
        <span className="field-hint">steps/sec, applies to every rule</span>
      </div>
      <input
        className="speed-slider"
        type="range"
        aria-label="Speed slider"
        min={MIN_STEPS_PER_SECOND}
        max={MAX_STEPS_PER_SECOND}
        step={0.5}
        value={stepsPerSecond}
        onChange={(e) => setStepsPerSecond(Number(e.target.value))}
      />

      <div className="sim-settings-row">
        <label className="field-label" htmlFor="max-abs-value-input">
          Max |value|
        </label>
        <input
          id="max-abs-value-input"
          className="parameter-number-input"
          type="text"
          inputMode="decimal"
          value={simLimits.maxAbsPrimaryVariableValue}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (Number.isFinite(parsed) && parsed > 0) setSimLimits({ maxAbsPrimaryVariableValue: parsed });
          }}
        />
      </div>
      <div className="sim-settings-row">
        <label className="field-label" htmlFor="max-abs-loss-input">
          Max loss
        </label>
        <input
          id="max-abs-loss-input"
          className="parameter-number-input"
          type="text"
          inputMode="decimal"
          value={simLimits.maxAbsLoss}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (Number.isFinite(parsed) && parsed > 0) setSimLimits({ maxAbsLoss: parsed });
          }}
        />
      </div>

      <div className="sim-settings-row">
        <label className="field-label" htmlFor="max-iterations-input">
          Stop after N iterations
        </label>
        <input
          id="max-iterations-input"
          className="parameter-number-input"
          type="text"
          inputMode="numeric"
          placeholder="uncapped"
          value={simLimits.maxIterations ?? ""}
          onChange={handleOptionalChange("maxIterations")}
        />
      </div>
      <div className="sim-settings-row">
        <label className="field-label" htmlFor="early-stop-loss-input">
          Stop when loss reaches
        </label>
        <input
          id="early-stop-loss-input"
          className="parameter-number-input"
          type="text"
          inputMode="decimal"
          placeholder="disabled"
          value={simLimits.earlyStopLossThreshold ?? ""}
          onChange={handleOptionalChange("earlyStopLossThreshold")}
        />
        <span className="field-hint">early stopping — pauses cleanly, not an error</span>
      </div>
    </CollapsiblePanel>
  );
}
