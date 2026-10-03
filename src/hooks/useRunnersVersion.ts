import { useEffect, useState } from "react";
import type { Subscribable } from "../domain/simulation/RunnerInterfaces";
import { useStableList } from "./useStableList";

/** Re-renders the calling component whenever ANY runner in `runners` notifies a change (multi-rule counterpart of `useRunnerVersion`). */
export function useRunnersVersion(runnerList: readonly Subscribable[]): number {
  const runners = useStableList(runnerList);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const unsubscribes = runners.map((r) => r.subscribe(() => setVersion((v) => v + 1)));
    return () => unsubscribes.forEach((u) => u());
  }, [runners]);
  return version;
}
