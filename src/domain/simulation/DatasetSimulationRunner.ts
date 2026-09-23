import { DatasetGradientSource } from "../dataset/DatasetGradientSource";
import type { CompiledPerExampleLoss, Dataset } from "../dataset/types";
import { ExprError } from "../expr/errors";
import { evaluateExpr } from "../expr/evaluate";
import type { CompiledRule, PrimaryVariable } from "../rules/ruleCompiler";
import type { DatasetRunTarget, DatasetTrajectoryPoint } from "./DatasetTypes";
import { SeededRng } from "./SeededRng";
import { DEFAULT_SIM_LIMITS, type RunnerStatus, type SimLimits } from "./types";

interface DatasetPeekResult {
  ok: true;
  newCoords: Record<string, number>;
  pendingState: Record<string, number>;
}
interface DatasetPeekFailure {
  ok: false;
  message: string;
}

interface DatasetStepResult {
  errored: boolean;
  message?: string;
  point?: DatasetTrajectoryPoint;
}

/**
 * Dataset mode's counterpart to `SimulationRunner` (DESIGN.md §18 Phase 7):
 * drives the same rule DSL, generalized to the workspace's two named
 * primary variables (§4) instead of the fixed spatial `x`/`y` pair, sampled
 * against a `DatasetGradientSource` instead of a single loss function's
 * analytic/numeric gradient. Deliberately a separate class rather than a
 * mode switch inside `SimulationRunner` — surface mode's runner, and every
 * Phase 1–6 test against it, is untouched by Phase 7 (DESIGN.md §7:
 * "nothing about surface mode changes").
 *
 * Exposes the same `status`/`play`/`pause`/`step`/`reset`/`subscribe`/
 * parameter surface as `SimulationRunner` (see `RunnerInterfaces.ts`), so
 * `ControlsBar`, `ParametersPanel`, and `RuleLiveValues` work unchanged.
 */
export class DatasetSimulationRunner {
  status: RunnerStatus = "idle";
  iteration = 0;
  trajectory: DatasetTrajectoryPoint[] = [];
  lastError: string | null = null;
  private runStartedAtMs: number | null = null;
  private listeners = new Set<() => void>();
  private paramValues: Record<string, number>;
  private stateValues: Record<string, number>;
  private rng: SeededRng;
  private gradientSource: DatasetGradientSource;
  private runTarget: DatasetRunTarget = null;

  constructor(
    private compiledRule: CompiledRule,
    private primaryVariables: readonly PrimaryVariable[],
    private initialValues: Record<string, number>,
    datasetSource: Dataset,
    perExampleLoss: CompiledPerExampleLoss,
    private batchSize: number,
    private seed: number,
    private simLimits: SimLimits = DEFAULT_SIM_LIMITS,
  ) {
    this.rng = new SeededRng(seed);
    this.gradientSource = new DatasetGradientSource(datasetSource, perExampleLoss, primaryVariables, batchSize, this.rng);
    this.paramValues = {};
    for (const p of compiledRule.parameters) this.paramValues[p.name] = p.defaultValue;
    this.stateValues = this.computeInitialState();
    this.trajectory = [this.snapshotAt(this.initialValues, 0, 0)];
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  get current(): DatasetTrajectoryPoint {
    return this.trajectory[this.trajectory.length - 1];
  }

  get parameters() {
    return this.compiledRule.parameters;
  }

  get currentStateValues(): Readonly<Record<string, number>> {
    return this.stateValues;
  }

  get currentParameterValues(): Readonly<Record<string, number>> {
    return this.paramValues;
  }

  setParameterValue(name: string, value: number): void {
    const decl = this.compiledRule.parameters.find((p) => p.name === name);
    if (!decl) return;
    this.paramValues[name] = Math.min(decl.max, Math.max(decl.min, value));
    this.notify();
  }

  resetParameterToDefault(name: string): void {
    const decl = this.compiledRule.parameters.find((p) => p.name === name);
    if (!decl) return;
    this.paramValues[name] = decl.defaultValue;
    this.notify();
  }

  /** Pending until the next Reset, mirroring surface mode's seed semantics (DESIGN.md §9). */
  setSeed(seed: number): void {
    this.seed = seed;
    this.notify();
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

  /** Divergence-safety configuration (DESIGN.md §12/§17) takes effect on the *next* step, like a parameter — mirrors surface mode's `SimulationRunner.setSimLimits`. */
  setSimLimits(limits: SimLimits): void {
    this.simLimits = limits;
    this.notify();
  }

  private computeInitialState(): Record<string, number> {
    const scope: Record<string, number> = { ...this.paramValues };
    const result: Record<string, number> = {};
    for (const decl of this.compiledRule.stateDecls) {
      const value = evaluateExpr(decl.initExpr, scope);
      scope[decl.name] = value;
      result[decl.name] = value;
    }
    return result;
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

  reset(): void {
    this.status = "idle";
    this.iteration = 0;
    this.runStartedAtMs = null;
    this.lastError = null;
    this.rng = new SeededRng(this.seed);
    this.gradientSource.reset(this.rng);
    this.stateValues = this.computeInitialState();
    this.trajectory = [this.snapshotAt(this.initialValues, 0, 0)];
    this.notify();
  }

  play(): void {
    if (this.status === "error") return;
    this.status = "running";
    this.notify();
  }

  pause(): void {
    if (this.status === "running") {
      this.status = "paused";
      this.notify();
    }
  }

  private buildStepScope(cur: DatasetTrajectoryPoint): Record<string, number> {
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

  peekUpdate(): DatasetPeekResult | DatasetPeekFailure {
    const cur = this.current;
    const scope = this.buildStepScope(cur);
    try {
      for (const statement of this.compiledRule.bodyStatements) {
        const value = evaluateExpr(statement.expr, scope);
        if (!Number.isFinite(value)) {
          return { ok: false, message: `'${statement.name}' evaluated to a non-finite value` };
        }
        scope[statement.name] = value;
      }
    } catch (err) {
      if (err instanceof ExprError) return { ok: false, message: err.message };
      throw err;
    }
    const newCoords: Record<string, number> = {};
    for (const v of this.primaryVariables) newCoords[v.name] = scope[`${v.name}_next`];
    const pendingState: Record<string, number> = {};
    for (const decl of this.compiledRule.stateDecls) pendingState[decl.name] = scope[decl.name];
    return { ok: true, newCoords, pendingState };
  }

  step(): DatasetStepResult {
    if (this.status === "error") {
      return { errored: true, message: this.lastError ?? "runner is in an error state" };
    }

    const peek = this.peekUpdate();
    if (!peek.ok) {
      this.status = "error";
      this.lastError = peek.message;
      this.notify();
      return { errored: true, message: peek.message };
    }

    if (this.runStartedAtMs === null) this.runStartedAtMs = performance.now();
    const elapsedMs = performance.now() - this.runStartedAtMs;
    const next = this.snapshotAt(peek.newCoords, this.iteration + 1, elapsedMs);
    const numericFields = [next.batchLoss, next.fullLoss, ...Object.values(next.coords), ...Object.values(next.batchGradient)];
    if (!numericFields.every(Number.isFinite)) {
      this.status = "error";
      this.lastError = "Simulation produced a non-finite value (NaN or Infinity) — last valid state preserved";
      this.notify();
      return { errored: true, message: this.lastError };
    }

    const exceedsPrimaryVariableBound = Object.values(next.coords).some((v) => Math.abs(v) > this.simLimits.maxAbsPrimaryVariableValue);
    if (exceedsPrimaryVariableBound) {
      this.status = "error";
      this.lastError = `Diverged: a primary variable exceeded the safety bound of ${this.simLimits.maxAbsPrimaryVariableValue} — last valid state preserved`;
      this.notify();
      return { errored: true, message: this.lastError };
    }

    // The FULL-dataset loss, not the mini-batch loss, is checked here — a
    // mini-batch's loss legitimately jumps around between different
    // samples, which would make the safety bound fire on ordinary sampling
    // noise rather than genuine divergence.
    if (next.fullLoss > this.simLimits.maxAbsLoss) {
      this.status = "error";
      this.lastError = `Diverged: loss exceeded the safety bound of ${this.simLimits.maxAbsLoss} — last valid state preserved`;
      this.notify();
      return { errored: true, message: this.lastError };
    }

    this.iteration += 1;
    this.stateValues = peek.pendingState;
    this.trajectory.push(next);

    if (this.runTarget?.kind === "epochs" && next.epoch >= this.runTarget.value) this.status = "paused";
    else if (this.runTarget?.kind === "seconds" && next.elapsedMs / 1000 >= this.runTarget.value) this.status = "paused";

    // Stopping criteria (never an error — a clean pause of a valid run):
    // a presenter-set iteration cap, or early stopping once the FULL loss
    // reaches a target the presenter is happy with.
    if (this.simLimits.maxIterations !== undefined && this.iteration >= this.simLimits.maxIterations) {
      this.status = "paused";
    }
    if (this.simLimits.earlyStopLossThreshold !== undefined && next.fullLoss <= this.simLimits.earlyStopLossThreshold) {
      this.status = "paused";
    }

    this.notify();
    return { errored: false, point: next };
  }
}
