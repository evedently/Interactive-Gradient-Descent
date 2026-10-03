import { DatasetGradientSource } from "../dataset/DatasetGradientSource";
import type { CompiledPerExampleLoss, Dataset } from "../dataset/types";
import type { CompiledRule, PrimaryVariable } from "../rules/ruleCompiler";
import type { DatasetRunTarget, DatasetTrajectoryPoint } from "./DatasetTypes";
import { RuleRunnerBase, type PeekFailure } from "./RuleRunnerBase";
import { DEFAULT_SIM_LIMITS, type SimLimits } from "./types";

interface DatasetPeekResult {
  ok: true;
  newCoords: Record<string, number>;
  pendingState: Record<string, number>;
}

/**
 * Dataset mode's counterpart to `SimulationRunner` (DESIGN.md §18 Phase 7):
 * drives the same rule DSL, generalized to the workspace's two named
 * primary variables (§4) instead of the fixed spatial `x`/`y` pair, sampled
 * against a `DatasetGradientSource` instead of a single loss function's
 * analytic/numeric gradient. Everything else — parameters, state,
 * play/pause/reset, divergence checks, stopping criteria — is shared via
 * `RuleRunnerBase`, so `ControlsBar`, `ParametersPanel`, and
 * `RuleLiveValues` work unchanged for both runner kinds.
 *
 * The divergence bound and early stopping use the FULL-dataset loss, not
 * the mini-batch loss — a mini-batch's loss legitimately jumps around
 * between samples, which would make the safety bound fire on ordinary
 * sampling noise rather than genuine divergence.
 */
export class DatasetSimulationRunner extends RuleRunnerBase<DatasetTrajectoryPoint, DatasetPeekResult> {
  private gradientSource: DatasetGradientSource;
  private runTarget: DatasetRunTarget = null;

  constructor(
    compiledRule: CompiledRule,
    private primaryVariables: readonly PrimaryVariable[],
    private initialValues: Record<string, number>,
    datasetSource: Dataset,
    perExampleLoss: CompiledPerExampleLoss,
    private batchSize: number,
    seed: number,
    simLimits: SimLimits = DEFAULT_SIM_LIMITS,
  ) {
    super(compiledRule, seed, simLimits);
    this.gradientSource = new DatasetGradientSource(datasetSource, perExampleLoss, primaryVariables, batchSize, this.rng);
    this.trajectory = [this.initialSnapshot()];
  }

  /** Takes effect on the next mini-batch sample, like a parameter — no reset needed. */
  setBatchSize(batchSize: number): void {
    this.batchSize = Math.max(1, Math.floor(batchSize));
    this.gradientSource.setBatchSize(this.batchSize);
    this.notify();
  }

  /** Pending until the next Reset, mirroring surface mode's start-point semantics (DESIGN.md §9) — dataset mode's analogue since there's no draggable point (§7). */
  setInitialValues(values: Record<string, number>): void {
    this.initialValues = values;
  }

  /** Stops a continuous run automatically once reached; `null` runs indefinitely (DESIGN.md §18 Phase 7). Checked at the end of every successful `step()`. */
  setRunTarget(target: DatasetRunTarget): void {
    this.runTarget = target;
    this.notify();
  }

  peekUpdate(): DatasetPeekResult | PeekFailure {
    const result = this.evaluateBody(this.current);
    if (!result.ok) return result;
    const newCoords: Record<string, number> = {};
    for (const v of this.primaryVariables) newCoords[v.name] = result.scope[`${v.name}_next`];
    return { ok: true, newCoords, pendingState: this.pendingStateFrom(result.scope) };
  }

  protected initialSnapshot(): DatasetTrajectoryPoint {
    return this.snapshotAt(this.initialValues, 0, 0);
  }

  protected snapshotAfter(peek: DatasetPeekResult, iteration: number, elapsedMs: number): DatasetTrajectoryPoint {
    return this.snapshotAt(peek.newCoords, iteration, elapsedMs);
  }

  protected buildStepScope(cur: DatasetTrajectoryPoint): Record<string, number> {
    const scope: Record<string, number> = { ...this.paramValues, ...this.stateValues };
    for (const v of this.primaryVariables) {
      scope[v.name] = cur.coords[v.name];
      scope[`g${v.name}`] = cur.batchGradient[v.name];
    }
    scope.loss = cur.batchLoss;
    scope.iteration = this.iteration;
    scope.elapsed_time = cur.elapsedMs / 1000;
    return scope;
  }

  protected numericFields(p: DatasetTrajectoryPoint): number[] {
    return [p.batchLoss, p.fullLoss, ...Object.values(p.coords), ...Object.values(p.batchGradient)];
  }

  protected primaryValues(p: DatasetTrajectoryPoint): number[] {
    return Object.values(p.coords);
  }

  protected stoppingLoss(p: DatasetTrajectoryPoint): number {
    return p.fullLoss;
  }

  protected resetSampling(): void {
    this.gradientSource.reset(this.rng);
  }

  protected reachedRunTarget(p: DatasetTrajectoryPoint): boolean {
    if (this.runTarget?.kind === "epochs") return p.epoch >= this.runTarget.value;
    if (this.runTarget?.kind === "seconds") return p.elapsedMs / 1000 >= this.runTarget.value;
    return false;
  }

  private snapshotAt(coords: Record<string, number>, iteration: number, elapsedMs: number): DatasetTrajectoryPoint {
    const sample = this.gradientSource.sample(coords);
    return {
      iteration,
      elapsedMs,
      coords,
      batchLoss: sample.batchLoss,
      fullLoss: sample.fullLoss,
      batchGradient: sample.batchGradient,
      fullGradient: sample.fullGradient,
      epoch: sample.epoch,
      batchIndex: sample.batchIndex,
      examplesProcessed: sample.examplesProcessed,
    };
  }
}
