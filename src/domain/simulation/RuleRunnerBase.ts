import { ExprError } from "../expr/errors";
import { evaluateExpr } from "../expr/evaluate";
import type { CompiledRule } from "../rules/ruleCompiler";
import { SeededRng } from "./SeededRng";
import type { RunnerStatus, SimLimits } from "./types";

export interface PeekFailure {
  ok: false;
  message: string;
}

/** What every successful peek carries; each runner adds its own mode-specific "where would it move" fields. */
export interface PeekSuccess {
  ok: true;
  pendingState: Record<string, number>;
}

/** `point` is the newly recorded trajectory point on success; `message` explains an error. */
export interface RuleStepResult<Point> {
  errored: boolean;
  message?: string;
  point?: Point;
}

type ScopeResult = { ok: true; scope: Record<string, number> } | PeekFailure;

const NON_FINITE_MESSAGE = "Simulation produced a non-finite value (NaN or Infinity) — last valid state preserved";

/**
 * Everything surface mode's `SimulationRunner` and dataset mode's
 * `DatasetSimulationRunner` have in common (DESIGN.md §6/§18 Phase 7): the
 * subscription bridge, parameter values, persistent state, play/pause,
 * running a rule's body statements, and `step()`'s divergence checks and
 * stopping criteria. Subclasses supply only what genuinely differs — how a
 * trajectory point is sampled, which scope names a rule sees, and which
 * fields count as "the loss" and "the primary variables".
 *
 * State persistence (DESIGN.md §4, Phase 2): `stateValues` is seeded from
 * each `state` declaration's initializer at construction and on every
 * Reset, then carried across steps as ordinary last-write-wins scope
 * values — whatever a state name equals at the end of a step's body
 * statements is exactly what next step reads back.
 *
 * Subclass constructors must set `this.trajectory = [this.initialSnapshot()]`
 * once their own sampling fields exist — the base constructor can't, since
 * it runs before them.
 */
export abstract class RuleRunnerBase<Point extends { iteration: number; elapsedMs: number }, Peek extends PeekSuccess> {
  status: RunnerStatus = "idle";
  iteration = 0;
  trajectory: Point[] = [];
  lastError: string | null = null;
  protected rng: SeededRng;
  protected paramValues: Record<string, number> = {};
  protected stateValues: Record<string, number>;
  private runStartedAtMs: number | null = null;
  private listeners = new Set<() => void>();

  protected constructor(
    protected compiledRule: CompiledRule,
    protected seed: number,
    protected simLimits: SimLimits,
  ) {
    this.rng = new SeededRng(seed);
    for (const p of compiledRule.parameters) this.paramValues[p.name] = p.defaultValue;
    this.stateValues = this.computeInitialState();
  }

  /** Evaluates what the next step WOULD do without committing anything — safe to call any time (spec §5's "when paused, the exact vector components should be visible"). */
  abstract peekUpdate(): Peek | PeekFailure;
  /** The point a fresh run (construction or Reset) starts from. */
  protected abstract initialSnapshot(): Point;
  /** The point a successful `peek` moves to. */
  protected abstract snapshotAfter(peek: Peek, iteration: number, elapsedMs: number): Point;
  /** The names a rule's body can read at `cur` (parameters, state, primary variables, gradients, loss, ...). */
  protected abstract buildStepScope(cur: Point): Record<string, number>;
  /** Every numeric field of `point` that must be finite for the step to be accepted. */
  protected abstract numericFields(point: Point): number[];
  /** The primary-variable values checked against `maxAbsPrimaryVariableValue`. */
  protected abstract primaryValues(point: Point): number[];
  /** The loss checked against `maxAbsLoss` and `earlyStopLossThreshold`. */
  protected abstract stoppingLoss(point: Point): number;
  /** Re-seeds whatever sampling the subclass does from the freshly recreated `this.rng`. */
  protected abstract resetSampling(): void;
  /** Mode-specific extra stopping condition (a clean pause, never an error). */
  protected reachedRunTarget(_point: Point): boolean {
    return false;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  protected notify(): void {
    for (const fn of this.listeners) fn();
  }

  get current(): Point {
    return this.trajectory[this.trajectory.length - 1];
  }

  get parameters() {
    return this.compiledRule.parameters;
  }

  /** Live, read-only snapshot of every declared state variable's current value (spec §4/§6: "displayed as live values"). */
  get currentStateValues(): Readonly<Record<string, number>> {
    return this.stateValues;
  }

  /** Live, read-only snapshot of every declared parameter's current (slider) value. */
  get currentParameterValues(): Readonly<Record<string, number>> {
    return this.paramValues;
  }

  /**
   * Sets a parameter's current value, clamped to its declared range. Mutates
   * the running instance in place — never rebuilds the runner or touches
   * `trajectory` — so it takes effect starting with the *next* step only
   * (DESIGN.md §4's "future steps only, never rewrites past history").
   */
  setParameterValue(name: string, value: number): void {
    const decl = this.compiledRule.parameters.find((p) => p.name === name);
    if (!decl) return;
    this.paramValues[name] = Math.min(decl.max, Math.max(decl.min, value));
    this.notify();
  }

  /** Resets one parameter back to its declared default — independent of the rule-level Reset (spec §4). */
  resetParameterToDefault(name: string): void {
    const decl = this.compiledRule.parameters.find((p) => p.name === name);
    if (!decl) return;
    this.paramValues[name] = decl.defaultValue;
    this.notify();
  }

  /** Pending seed for the *next* Reset — mid-run reseeding would produce neither the old nor the new sequence (DESIGN.md §9). */
  setSeed(seed: number): void {
    this.seed = seed;
    this.notify();
  }

  /** Divergence-safety configuration (DESIGN.md §12/§17) takes effect on the *next* step, like a parameter — never needs a Reset. */
  setSimLimits(limits: SimLimits): void {
    this.simLimits = limits;
    this.notify();
  }

  /** Restores every state variable to its initializer, the position to its start, and the RNG to its (possibly newly-set) seed. Parameters are untouched. */
  reset(): void {
    this.status = "idle";
    this.iteration = 0;
    this.runStartedAtMs = null;
    this.lastError = null;
    this.rng = new SeededRng(this.seed);
    this.resetSampling();
    this.stateValues = this.computeInitialState();
    this.trajectory = [this.initialSnapshot()];
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

  /**
   * Advances exactly one iteration (Step button and the continuous-run
   * loop). Always stops on NaN/Infinity (DESIGN.md §17), then checks the two
   * genuine divergence bounds — crossing either enters `'error'` with the
   * last valid state preserved. A temporary loss increase (momentum
   * overshoot, noisy gradients) is normal and never stops the run by itself.
   */
  step(): RuleStepResult<Point> {
    if (this.status === "error") {
      return { errored: true, message: this.lastError ?? "runner is in an error state" };
    }

    const peek = this.peekUpdate();
    if (!peek.ok) return this.fail(peek.message);

    if (this.runStartedAtMs === null) this.runStartedAtMs = performance.now();
    const elapsedMs = performance.now() - this.runStartedAtMs;
    const next = this.snapshotAfter(peek, this.iteration + 1, elapsedMs);

    const divergence = this.divergenceMessage(next);
    if (divergence) return this.fail(divergence);

    this.iteration += 1;
    this.stateValues = peek.pendingState;
    this.trajectory.push(next);
    if (this.reachedStoppingCriterion(next)) this.status = "paused";

    this.notify();
    return { errored: false, point: next };
  }

  /** Runs the rule's body statements against `cur`'s scope; never commits anything. */
  protected evaluateBody(cur: Point): ScopeResult {
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
    return { ok: true, scope };
  }

  /** Every declared state variable's value at the end of a body evaluation. */
  protected pendingStateFrom(scope: Record<string, number>): Record<string, number> {
    const pendingState: Record<string, number> = {};
    for (const decl of this.compiledRule.stateDecls) pendingState[decl.name] = scope[decl.name];
    return pendingState;
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

  private divergenceMessage(next: Point): string | null {
    if (!this.numericFields(next).every(Number.isFinite)) return NON_FINITE_MESSAGE;
    const { maxAbsPrimaryVariableValue, maxAbsLoss } = this.simLimits;
    if (this.primaryValues(next).some((v) => Math.abs(v) > maxAbsPrimaryVariableValue)) {
      return `Diverged: a primary variable exceeded the safety bound of ${maxAbsPrimaryVariableValue} — last valid state preserved`;
    }
    if (this.stoppingLoss(next) > maxAbsLoss) {
      return `Diverged: loss exceeded the safety bound of ${maxAbsLoss} — last valid state preserved`;
    }
    return null;
  }

  /** A presenter-set iteration cap, early stopping once loss reaches a target, or a mode-specific run target — a clean pause of a valid run, never an error. */
  private reachedStoppingCriterion(next: Point): boolean {
    const { maxIterations, earlyStopLossThreshold } = this.simLimits;
    if (this.reachedRunTarget(next)) return true;
    if (maxIterations !== undefined && this.iteration >= maxIterations) return true;
    return earlyStopLossThreshold !== undefined && this.stoppingLoss(next) <= earlyStopLossThreshold;
  }

  private fail(message: string): RuleStepResult<Point> {
    this.status = "error";
    this.lastError = message;
    this.notify();
    return { errored: true, message };
  }
}
