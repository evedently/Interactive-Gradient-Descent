import { useEffect, useRef } from "react";
import type { Steppable } from "../domain/simulation/RunnerInterfaces";

/**
 * Drives every runner in `runners` at the same rate, independently — one
 * rule can be running while another is paused (DESIGN.md §18 Phase 4:
 * "running one rule at a time" and "running several simultaneously" are
 * both ordinary states of the same mechanism, not separate modes). Typed
 * against `Steppable` so `DatasetSimulationRunner` (Phase 7) drives through
 * the exact same loop as surface mode's `SimulationRunner`.
 *
 * `stepsPerSecond` is a single workspace-wide speed shared by every rule
 * (never per-rule) — it only paces how often `.step()` is called from this
 * RAF loop, so it takes effect immediately with no rebuild/reset needed.
 */
export function useContinuousRunAll(runners: Steppable[], stepsPerSecond: number): void {
  const lastStepTimes = useRef(new Map<Steppable, number>());

  useEffect(() => {
    let rafId = 0;
    const intervalMs = 1000 / stepsPerSecond;

    const tick = (now: number) => {
      for (const runner of runners) {
        if (runner.status === "running") {
          const last = lastStepTimes.current.get(runner);
          if (last === undefined) {
            lastStepTimes.current.set(runner, now);
          } else if (now - last >= intervalMs) {
            lastStepTimes.current.set(runner, now);
            runner.step();
          }
        } else {
          lastStepTimes.current.delete(runner);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [runners, stepsPerSecond]);
}
