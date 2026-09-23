import { useRef } from "react";
import type { CompiledPerExampleLoss, Dataset } from "../domain/dataset/types";
import type { CompiledRule, PrimaryVariable } from "../domain/rules/ruleCompiler";
import { deriveSeed } from "../domain/simulation/SeededRng";
import { DatasetSimulationRunner } from "../domain/simulation/DatasetSimulationRunner";
import type { SimLimits } from "../domain/simulation/types";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";

interface RunnerKey {
  dataset: Dataset;
  perExampleLoss: CompiledPerExampleLoss;
  compiledRule: CompiledRule;
}

/**
 * Dataset mode's counterpart to `useMultiRunners` (DESIGN.md §18 Phase 7):
 * one `DatasetSimulationRunner` per rule, replaced only when the shared
 * dataset, the shared per-example loss, or that rule's own compiled rule
 * identity changes — the same "don't rebuild on every keystroke, only on a
 * successful recompile" invariant as surface mode (DESIGN.md §9).
 * `batchSize`/`workspaceSeed`/`initialValues` are pushed into existing
 * runners via their own setters (see the dataset workspace view), never by
 * rebuilding here.
 */
export function useDatasetRunners(
  rules: RuleWorkspaceEntry[],
  dataset: Dataset | null,
  perExampleLoss: CompiledPerExampleLoss | null,
  primaryVariables: readonly PrimaryVariable[],
  initialValues: Record<string, number>,
  workspaceSeed: number,
  batchSize: number,
  simLimits: SimLimits,
): Map<string, DatasetSimulationRunner> {
  const runners = useRef(new Map<string, DatasetSimulationRunner>());
  const keys = useRef(new Map<string, RunnerKey>());

  const currentIds = new Set(rules.map((r) => r.id));
  for (const id of Array.from(runners.current.keys())) {
    if (!currentIds.has(id)) {
      runners.current.delete(id);
      keys.current.delete(id);
    }
  }

  if (dataset && perExampleLoss) {
    for (const rule of rules) {
      const prevKey = keys.current.get(rule.id);
      const changed =
        !prevKey || prevKey.dataset !== dataset || prevKey.perExampleLoss !== perExampleLoss || prevKey.compiledRule !== rule.activeCompiledRule;
      if (changed) {
        const seed = deriveSeed(workspaceSeed, rule.id);
        runners.current.set(
          rule.id,
          new DatasetSimulationRunner(rule.activeCompiledRule, primaryVariables, { ...initialValues }, dataset, perExampleLoss, batchSize, seed, simLimits),
        );
        keys.current.set(rule.id, { dataset, perExampleLoss, compiledRule: rule.activeCompiledRule });
      }
    }
  } else {
    runners.current.clear();
    keys.current.clear();
  }

  return runners.current;
}
