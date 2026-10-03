import type { ParameterDecl } from "../rules/ruleCompiler";
import type { RunnerStatus } from "./types";

/**
 * The structural surface every runner (surface-mode `SimulationRunner` and
 * dataset-mode `DatasetSimulationRunner`, DESIGN.md §18 Phase 7) exposes for
 * its React subscription bridge. Component/hook props are typed against
 * this interface — never the concrete class — so `useRunnerVersion`,
 * `ControlsBar`, `ParametersPanel`, and `RuleLiveValues` work unchanged for
 * both runner kinds (structural typing; no behavior change for the
 * existing surface-mode call sites, which already satisfy this shape).
 */
export interface Subscribable {
  subscribe(fn: () => void): () => void;
}

export interface Steppable extends Subscribable {
  status: RunnerStatus;
  play(): void;
  pause(): void;
  // Deliberately not `RuleStepResult` here — `ControlsBar` never reads the
  // returned point, and each runner's own `step()` return type (which
  // does carry a mode-specific point) is still assignable to this wider
  // shape via ordinary structural covariance.
  step(): { errored: boolean; message?: string };
  reset(): void;
}

export interface ParameterizedRunner extends Subscribable {
  parameters: ParameterDecl[];
  currentParameterValues: Readonly<Record<string, number>>;
  setParameterValue(name: string, value: number): void;
  resetParameterToDefault(name: string): void;
}

export interface StateReadableRunner extends Subscribable {
  currentStateValues: Readonly<Record<string, number>>;
}
