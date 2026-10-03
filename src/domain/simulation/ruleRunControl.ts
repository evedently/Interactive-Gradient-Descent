import type { Steppable } from "./RunnerInterfaces";

export interface VisibleRunnerEntry {
  rule: { visible: boolean };
  runner: Steppable;
}

/**
 * "Run all" only starts rules whose trajectory is shown — a hidden rule
 * would otherwise keep stepping forever with nothing on screen (and no
 * Status HUD row) to show it was running.
 */
export function playVisibleRunners(entries: readonly VisibleRunnerEntry[]): void {
  for (const { rule, runner } of entries) {
    if (rule.visible) runner.play();
  }
}

/** Hiding a rule pauses it, so a run can never continue invisibly. Non-running runners are left alone. */
export function pauseHiddenRunners(entries: readonly VisibleRunnerEntry[]): void {
  for (const { rule, runner } of entries) {
    if (!rule.visible && runner.status === "running") runner.pause();
  }
}
