import type { ResolvedLoss } from "../domain/lossFunction";
import { deriveSeed } from "../domain/simulation/SeededRng";
import { SimulationRunner } from "../domain/simulation/SimulationRunner";
import type { SimLimits } from "../domain/simulation/types";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";
import { useKeyedRunners } from "./useKeyedRunners";

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
  return useKeyedRunners(
    rules,
    (rule) => [loss, rule.activeCompiledRule],
    (rule) => new SimulationRunner(loss, rule.activeCompiledRule, startPoint, deriveSeed(workspaceSeed, rule.id), noiseLevel, simLimits),
  );
}
