import { useRef } from "react";
import { KeyedRunnerCache, type RunnerKey } from "../domain/simulation/KeyedRunnerCache";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";

/**
 * React binding for `KeyedRunnerCache`: synced synchronously during render
 * (like `useMemo`, but keyed per rule id instead of one fixed dependency
 * array). Returns the same mutable `Map` instance every render.
 */
export function useKeyedRunners<R>(
  rules: readonly RuleWorkspaceEntry[],
  keyFor: (rule: RuleWorkspaceEntry) => RunnerKey,
  create: (rule: RuleWorkspaceEntry) => R,
): Map<string, R> {
  const cache = useRef(new KeyedRunnerCache<R>());
  cache.current.sync(rules, keyFor, create);
  return cache.current.runners;
}
