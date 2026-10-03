import type { CompiledPerExampleLoss, Dataset } from "../domain/dataset/types";
import type { PrimaryVariable } from "../domain/rules/ruleCompiler";
import { deriveSeed } from "../domain/simulation/SeededRng";
import { DatasetSimulationRunner } from "../domain/simulation/DatasetSimulationRunner";
import type { SimLimits } from "../domain/simulation/types";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";
import { useKeyedRunners } from "./useKeyedRunners";

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
  // No dataset or no valid per-example loss yet: no runners at all.
  const ready = dataset !== null && perExampleLoss !== null;
  return useKeyedRunners(
    ready ? rules : [],
    (rule) => [dataset, perExampleLoss, rule.activeCompiledRule],
    (rule) =>
      new DatasetSimulationRunner(
        rule.activeCompiledRule,
        primaryVariables,
        { ...initialValues },
        dataset!,
        perExampleLoss!,
        batchSize,
        deriveSeed(workspaceSeed, rule.id),
        simLimits,
      ),
  );
}
