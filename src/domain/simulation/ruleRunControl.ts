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

/** The rule the dataset step inspector and batch highlight follow: the focused rule if it's still present and visible, otherwise the first visible rule. */
export function pickFocusedEntry<E extends { rule: { id: string; visible: boolean } }>(entries: readonly E[], focusedRuleId: string | null): E | null {
  const visible = entries.filter((e) => e.rule.visible);
  return visible.find((e) => e.rule.id === focusedRuleId) ?? visible[0] ?? null;
}
