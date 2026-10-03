import type { Steppable } from "../domain/simulation/RunnerInterfaces";
import { useRunnerVersion } from "../hooks/useRunnerVersion";

interface Props {
  runner: Steppable;
  disabled: boolean;
  /** Called before any of this rule's own controls acts (e.g. so dataset mode can focus the rule being driven). */
  onInteract?: () => void;
}

export function ControlsBar({ runner, disabled, onInteract }: Props) {
  useRunnerVersion(runner);
  const act = (action: () => void) => () => {
    onInteract?.();
    action();
  };

  return (
    <div className="controls-bar">
      <button disabled={disabled || runner.status === "running"} onClick={act(() => runner.play())}>
        Play
      </button>
      <button disabled={disabled || runner.status !== "running"} onClick={act(() => runner.pause())}>
        Pause
      </button>
      <button disabled={disabled || runner.status === "error"} onClick={act(() => runner.step())}>
        Step
      </button>
      <button disabled={disabled} onClick={act(() => runner.reset())}>
        Reset
      </button>
      <span className={`status-badge status-${runner.status}`}>{runner.status}</span>
    </div>
  );
}
