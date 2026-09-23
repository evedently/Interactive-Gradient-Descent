import type { StateReadableRunner } from "../domain/simulation/RunnerInterfaces";
import { useRunnerVersion } from "../hooks/useRunnerVersion";

interface Props {
  runner: StateReadableRunner;
}

/**
 * Live values for a rule's state variables (spec §4: "State variables
 * should not automatically become sliders. They should be displayed as
 * live values"). Parameters get their own editable sliders in
 * `ParametersPanel` (DESIGN.md §18 Phase 3) — they no longer appear here.
 */
export function RuleLiveValues({ runner }: Props) {
  useRunnerVersion(runner);
  const stateValues = runner.currentStateValues;
  const stateNames = Object.keys(stateValues);

  if (stateNames.length === 0) return null;

  return (
    <div className="rule-live-values">
      <div className="live-values-row">
        <span className="live-values-label">State:</span>
        {stateNames.map((name) => (
          <span key={name} className="live-value-chip">
            {name} = {stateValues[name].toFixed(6)}
          </span>
        ))}
      </div>
    </div>
  );
}
