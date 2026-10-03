import { shallowEqualArrays } from "../../lib/arrays";

/** Every identity a runner was built from; a change to any element (compared with `===`) means the runner is stale. */
export type RunnerKey = readonly unknown[];

/**
 * One runner per rule id, rebuilt only when that rule's key changes
 * (DESIGN.md §9: an edit that doesn't successfully recompile must not
 * disturb any runner, including every *other* rule's). Runners for rules
 * that no longer exist are dropped. Settings that existing runners accept
 * through setters (seed, noise, limits, ...) are deliberately NOT part of
 * the key — callers push those in instead of rebuilding.
 */
export class KeyedRunnerCache<R> {
  readonly runners = new Map<string, R>();
  private readonly keys = new Map<string, RunnerKey>();

  sync<Rule extends { id: string }>(rules: readonly Rule[], keyFor: (rule: Rule) => RunnerKey, create: (rule: Rule) => R): void {
    const currentIds = new Set(rules.map((r) => r.id));
    for (const id of Array.from(this.runners.keys())) {
      if (!currentIds.has(id)) {
        this.runners.delete(id);
        this.keys.delete(id);
      }
    }

    for (const rule of rules) {
      const key = keyFor(rule);
      const previous = this.keys.get(rule.id);
      if (previous && shallowEqualArrays(previous, key)) continue;
      this.runners.set(rule.id, create(rule));
      this.keys.set(rule.id, key);
    }
  }
}
