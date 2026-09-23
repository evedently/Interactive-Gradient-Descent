import type { Steppable } from "../domain/simulation/RunnerInterfaces";
import { useRunnerVersion } from "../hooks/useRunnerVersion";

interface Props {
  runner: Steppable;
  disabled: boolean;
}

export function ControlsBar({ runner, disabled }: Props) {
  useRunnerVersion(runner);

  return (
    <div className="controls-bar">
      <button disabled={disabled || runner.status === "running"} onClick={() => runner.play()}>
        Play
      </button>
      <button disabled={disabled || runner.status !== "running"} onClick={() => runner.pause()}>
        Pause
      </button>
      <button disabled={disabled || runner.status === "error"} onClick={() => runner.step()}>
        Step
      </button>
      <button disabled={disabled} onClick={() => runner.reset()}>
        Reset
      </button>
      <span className={`status-badge status-${runner.status}`}>{runner.status}</span>
    </div>
  );
}
