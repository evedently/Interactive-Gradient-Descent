import { useRef } from "react";
import type { ResolvedLoss } from "../domain/lossFunction";
import type { CompiledRule } from "../domain/rules/ruleCompiler";
import { deriveSeed } from "../domain/simulation/SeededRng";
import { SimulationRunner } from "../domain/simulation/SimulationRunner";
import type { SimLimits } from "../domain/simulation/types";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";

interface RunnerKey {
  loss: ResolvedLoss;
  compiledRule: CompiledRule;
}

/**
 * Maintains one `SimulationRunner` per rule, replacing a rule's runner only
 * when the shared resolved loss (text, differentiation mode, or manual
 * override — DESIGN.md §5/§9) or that rule's own compiled rule identity
 * changes: an edit that doesn't successfully recompile must not disturb
 * any runner, including every *other* rule's. This mirrors the
 * single-runner `useMemo` pattern from Phases 1–3, generalized to a
 * dynamic list: recomputed synchronously during render (like `useMemo`),
 * just keyed per rule id instead of a single fixed dependency array.
 *
 * `workspaceSeed`/`noiseLevel`/`simLimits` are only used for a *newly
 * created* runner's initial values — deriving `deriveSeed(workspaceSeed,
 * rule.id)` so each rule's stream depends only on its own id, never on how
 * many other rules exist (DESIGN.md §10, Phase 6). Later changes to any of
 * them are pushed into existing runners via `setSeed`/`setNoiseLevel`/
 * `setSimLimits` (see `SurfaceWorkspaceView`), never by rebuilding here — a
 * seed change takes effect on the next Reset, and a noise-level or
 * sim-limits change on the next step, exactly like a start-point drag or a
 * parameter edit.
 */
export function useMultiRunners(
  rules: RuleWorkspaceEntry[],
  loss: ResolvedLoss,
  startPoint: { x: number; y: number },
  workspaceSeed: number,
  noiseLevel: number,
  simLimits: SimLimits,
): Map<string, SimulationRunner> {
  const runners = useRef(new Map<string, SimulationRunner>());
  const keys = useRef(new Map<string, RunnerKey>());

  const currentIds = new Set(rules.map((r) => r.id));
  for (const id of Array.from(runners.current.keys())) {
    if (!currentIds.has(id)) {
      runners.current.delete(id);
      keys.current.delete(id);
    }
  }

  for (const rule of rules) {
    const prevKey = keys.current.get(rule.id);
    const changed = !prevKey || prevKey.loss !== loss || prevKey.compiledRule !== rule.activeCompiledRule;
    if (changed) {
      const seed = deriveSeed(workspaceSeed, rule.id);
      runners.current.set(rule.id, new SimulationRunner(loss, rule.activeCompiledRule, startPoint, seed, noiseLevel, simLimits));
      keys.current.set(rule.id, { loss, compiledRule: rule.activeCompiledRule });
    }
  }

  return runners.current;
}
