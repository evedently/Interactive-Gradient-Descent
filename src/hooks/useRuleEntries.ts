import { useMemo } from "react";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";
import { useStableList } from "./useStableList";

export interface RuleEntry<R> {
  rule: RuleWorkspaceEntry;
  runner: R;
}

/**
 * Pairs each rule with its runner, returning the SAME array until a rule or
 * a runner actually changes. The workspace views key their runner-sync
 * effects on this list, so a fresh array every render would push seed/
 * noise/limits into every runner (and notify every subscriber) on every
 * render. Pass `enabled = false` for "no runners yet" (dataset mode before a
 * dataset is loaded).
 */
export function useRuleEntries<R>(rules: RuleWorkspaceEntry[], runners: Map<string, R>, enabled = true): RuleEntry<R>[] {
  const activeRules = enabled ? rules : [];
  const runnerList = useStableList(activeRules.map((rule) => runners.get(rule.id)!));
  const stableRules = useStableList(activeRules);
  return useMemo(() => stableRules.map((rule, i) => ({ rule, runner: runnerList[i] })), [stableRules, runnerList]);
}
