import type { PrimaryVariable } from "../rules/ruleCompiler";
import type { DatasetSimulationRunner } from "../simulation/DatasetSimulationRunner";
import type { SimulationRunner } from "../simulation/SimulationRunner";

/** A minimal, store-independent view of a rule — just enough to label CSV rows (DESIGN.md §16's experiment export). */
export interface ExportableRule {
  id: string;
  name: string;
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Surface mode's experiment export (DESIGN.md §16/§18 Phase 8): one row
 * per recorded trajectory point across every rule, batch/epoch columns
 * omitted entirely — "batch concepts aren't displayed unless dataset mode
 * is active" (§7) applies to the export too.
 */
export function buildSurfaceExperimentCsv(rules: ExportableRule[], runners: Map<string, SimulationRunner>): string {
  const header = ["rule", "iteration", "elapsed_ms", "x", "y", "loss", "gx", "gy", "noisy_gx", "noisy_gy"];
  const lines = [header.join(",")];
  for (const rule of rules) {
    const runner = runners.get(rule.id);
    if (!runner) continue;
    for (const p of runner.trajectory) {
      lines.push([csvEscape(rule.name), p.iteration, p.elapsedMs, p.x, p.y, p.loss, p.gx, p.gy, p.noisyGx, p.noisyGy].join(","));
    }
  }
  return lines.join("\n") + "\n";
}

/** Dataset mode's experiment export — gains the epoch/batch_index/batch_loss/full_loss columns §16 calls for, plus one column per primary variable. */
export function buildDatasetExperimentCsv(
  rules: ExportableRule[],
  runners: Map<string, DatasetSimulationRunner>,
  primaryVariables: readonly PrimaryVariable[],
): string {
  const varNames = primaryVariables.map((v) => v.name);
  const header = ["rule", "iteration", "elapsed_ms", "epoch", "batch_index", "examples_processed", "batch_loss", "full_loss", ...varNames];
  const lines = [header.join(",")];
  for (const rule of rules) {
    const runner = runners.get(rule.id);
    if (!runner) continue;
    for (const p of runner.trajectory) {
      lines.push(
        [
          csvEscape(rule.name),
          p.iteration,
          p.elapsedMs,
          p.epoch,
          p.batchIndex,
          p.examplesProcessed,
          p.batchLoss,
          p.fullLoss,
          ...varNames.map((name) => p.coords[name]),
        ].join(","),
      );
    }
  }
  return lines.join("\n") + "\n";
}
