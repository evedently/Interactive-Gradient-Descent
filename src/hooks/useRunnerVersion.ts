import { useEffect, useState } from "react";
import type { Subscribable } from "../domain/simulation/RunnerInterfaces";

/**
 * Re-renders the calling component whenever `runner` notifies a change.
 * The runner itself is not React/Zustand state (DESIGN.md §12) — this hook
 * is the subscription bridge, kept deliberately dumb (a version counter)
 * rather than mirroring the runner's fields into React state. Typed
 * against `Subscribable` rather than the concrete `SimulationRunner` class
 * so it works unchanged for `DatasetSimulationRunner` too (DESIGN.md §18
 * Phase 7).
 */
export function useRunnerVersion(runner: Subscribable): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setVersion(0);
    return runner.subscribe(() => setVersion((v) => v + 1));
  }, [runner]);
  return version;
}
