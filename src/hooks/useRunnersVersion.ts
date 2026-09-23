import { useEffect, useState } from "react";
import type { Subscribable } from "../domain/simulation/RunnerInterfaces";

/** Re-renders the calling component whenever ANY runner in `runners` notifies a change (multi-rule counterpart of `useRunnerVersion`). */
export function useRunnersVersion(runners: Subscribable[]): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const unsubscribes = runners.map((r) => r.subscribe(() => setVersion((v) => v + 1)));
    return () => unsubscribes.forEach((u) => u());
  }, [runners]);
  return version;
}
