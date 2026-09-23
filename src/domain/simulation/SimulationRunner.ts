import { ExprError } from "../expr/errors";
import { evaluateExpr } from "../expr/evaluate";
import { computeLossGradient, evaluateLoss, type ResolvedLoss } from "../lossFunction";
import type { CompiledRule } from "../rules/ruleCompiler";
import { SeededRng } from "./SeededRng";
import { DEFAULT_SIM_LIMITS, type PendingUpdateResult, type RunnerStatus, type SimLimits, type StepResult, type TrajectoryPoint } from "./types";

/**
 * Drives one update rule against one loss function (DESIGN.md §6). Not a
 * React object: this class has no rendering dependency so it can be unit
 * tested directly and, later, moved behind a Web Worker without a rewrite.
 * A React hook drives it via `subscribe`/`step`/`play`/`pause`/`reset`.
 *
 * State persistence (DESIGN.md §4, Phase 2): `stateValues` is seeded from
 * each `state` declaration's initializer at construction and on every
 * Reset, then carried across steps as ordinary last-write-wins scope
 * values — whatever a state name equals at the end of a step's body
 * statements is exactly what next step reads back.
 *
 * Noise and reproducibility (DESIGN.md §10, Phase 6): `seed` is this
 * rule's own *derived* seed (see `deriveSeed` — callers pass
 * `deriveSeed(workspaceSeed, ruleId)`, never the raw workspace seed
 * directly), so this runner's stochastic sequence never depends on which
 * other rules exist. A noisy gradient sample is drawn exactly once per new
 * trajectory point (in `snapshotAt`, called from the constructor, `reset`,
 * and `step` — never from `peekUpdate`), so calling `peekUpdate` repeatedly
 * (e.g. every render frame while paused) never perturbs the RNG.
 */
export class SimulationRunner {
  status: RunnerStatus = "idle";
  iteration = 0;
  trajectory: TrajectoryPoint[] = [];
  lastError: string | null = null;
  private runStartedAtMs: number | null = null;
  private listeners = new Set<() => void>();
  private paramValues: Record<string, number>;
  private stateValues: Record<string, number>;
  private rng: SeededRng;

  constructor(
    private loss: ResolvedLoss,
    private compiledRule: CompiledRule,
    private startPoint: { x: number; y: number },
    private seed: number,
    private noiseLevel: number,
    private simLimits: SimLimits = DEFAULT_SIM_LIMITS,
  ) {
    this.rng = new SeededRng(seed);
    this.paramValues = {};
    for (const p of compiledRule.parameters) this.paramValues[p.name] = p.defaultValue;
    this.stateValues = this.computeInitialState();
    this.trajectory = [this.snapshotAt(startPoint.x, startPoint.y, 0, 0)];
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  get current(): TrajectoryPoint {
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
   * Sets a parameter's current value (e.g. from a slider or its numeric
   * box), clamped to its declared range. This mutates the running instance
   * in place — it never rebuilds the runner or touches `trajectory` — so
   * it takes effect starting with the *next* step only; every already-
   * recorded trajectory point is untouched (DESIGN.md §4's "future steps
   * only, never rewrites past history", Phase 3's acceptance criterion).
   */
  setParameterValue(name: string, value: number): void {
    const decl = this.compiledRule.parameters.find((p) => p.name === name);
    if (!decl) return;
    this.paramValues[name] = Math.min(decl.max, Math.max(decl.min, value));
    this.notify();
  }

  /** Resets one parameter back to its declared default — independent of the rule-level Reset (position/state), per spec §4's per-parameter "reset to default" control. */
  resetParameterToDefault(name: string): void {
    const decl = this.compiledRule.parameters.find((p) => p.name === name);
    if (!decl) return;
    this.paramValues[name] = decl.defaultValue;
    this.notify();
  }

  /** Pending seed for the *next* Reset — changing the seed mid-run would produce neither the old nor the new sequence, so it never reseeds immediately (DESIGN.md §9's "changing the seed requires resetting"). */
  setSeed(seed: number): void {
    this.seed = seed;
    this.notify();
  }

  /** Noise level takes effect on the *next* step, like a parameter — no reset needed (DESIGN.md §10). */
  setNoiseLevel(level: number): void {
    this.noiseLevel = level;
    this.notify();
  }

  /** Divergence-safety configuration (DESIGN.md §12/§17) takes effect on the *next* step, like a parameter — it's a safety config, not simulation state, so it never needs a Reset. */
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

  /** Computes loss/true-gradient at (x,y) and draws exactly one fresh noise sample — the only place this runner reads from its RNG. */
  private snapshotAt(x: number, y: number, iteration: number, elapsedMs: number): TrajectoryPoint {
    const loss = evaluateLoss(this.loss.ast, x, y);
    const { gx, gy } = computeLossGradient(this.loss, x, y);
    const noisyGx = gx + this.noiseLevel * this.rng.normal();
    const noisyGy = gy + this.noiseLevel * this.rng.normal();
    return { iteration, elapsedMs, x, y, loss, gx, gy, noisyGx, noisyGy };
  }

  /** Updates the shared starting point (e.g. after a drag, DESIGN.md §9). Takes effect on the next Reset. */
  setStartPoint(point: { x: number; y: number }): void {
    this.startPoint = point;
  }

  /** Restores every state variable to its initializer, position to the start point, and the RNG to its (possibly newly-set) seed. Parameters are untouched. */
  reset(): void {
    this.status = "idle";
    this.iteration = 0;
    this.runStartedAtMs = null;
    this.lastError = null;
    this.rng = new SeededRng(this.seed);
    this.stateValues = this.computeInitialState();
    this.trajectory = [this.snapshotAt(this.startPoint.x, this.startPoint.y, 0, 0)];
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

  private buildStepScope(cur: TrajectoryPoint): Record<string, number> {
    return {
      ...this.paramValues,
      ...this.stateValues,
      x: cur.x,
      y: cur.y,
      gx: cur.noisyGx,
      gy: cur.noisyGy,
      loss: cur.loss,
      iteration: this.iteration,
      elapsed_time: cur.elapsedMs / 1000,
    };
  }

  /**
   * Evaluates what the next step WOULD do without committing anything —
   * safe to call any time, including while paused or idle, so the update
   * vector is visible before Step/Play is pressed (spec §5's "when paused,
   * the exact vector components should be visible"). Never touches the
   * RNG — the noisy gradient it uses was already drawn when `current` was
   * created.
   */
  peekUpdate(): PendingUpdateResult {
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
    const newX = scope["x_next"];
    const newY = scope["y_next"];
    const pendingState: Record<string, number> = {};
    for (const decl of this.compiledRule.stateDecls) pendingState[decl.name] = scope[decl.name];
    return { ok: true, dx: newX - cur.x, dy: newY - cur.y, newX, newY, pendingState };
  }

  /**
   * Advances exactly one iteration. Used by both the Step button and the
   * continuous-run loop. Always stops on NaN/Infinity (DESIGN.md §17), then
   * checks the two genuine divergence bounds (max abs value, max abs
   * loss) — crossing either enters `'error'` with the last valid state
   * preserved. A temporary loss increase (momentum overshoot, noisy
   * gradients) is normal and never stops the run by itself.
   */
  step(): StepResult {
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
    const next = this.snapshotAt(peek.newX, peek.newY, this.iteration + 1, elapsedMs);
    const allFinite = [next.x, next.y, next.loss, next.gx, next.gy, next.noisyGx, next.noisyGy].every(Number.isFinite);
    if (!allFinite) {
      this.status = "error";
      this.lastError = "Simulation produced a non-finite value (NaN or Infinity) — last valid state preserved";
      this.notify();
      return { errored: true, message: this.lastError };
    }

    if (Math.abs(next.x) > this.simLimits.maxAbsPrimaryVariableValue || Math.abs(next.y) > this.simLimits.maxAbsPrimaryVariableValue) {
      this.status = "error";
      this.lastError = `Diverged: a primary variable exceeded the safety bound of ${this.simLimits.maxAbsPrimaryVariableValue} — last valid state preserved`;
      this.notify();
      return { errored: true, message: this.lastError };
    }

    if (next.loss > this.simLimits.maxAbsLoss) {
      this.status = "error";
      this.lastError = `Diverged: loss exceeded the safety bound of ${this.simLimits.maxAbsLoss} — last valid state preserved`;
      this.notify();
      return { errored: true, message: this.lastError };
    }

    this.iteration += 1;
    this.stateValues = peek.pendingState;
    this.trajectory.push(next);

    // Stopping criteria (never an error — a clean pause of a valid run):
    // a presenter-set iteration cap, or early stopping once loss reaches
    // a target the presenter is happy with.
    if (this.simLimits.maxIterations !== undefined && this.iteration >= this.simLimits.maxIterations) {
      this.status = "paused";
    }
    if (this.simLimits.earlyStopLossThreshold !== undefined && next.loss <= this.simLimits.earlyStopLossThreshold) {
      this.status = "paused";
    }

    this.notify();
    return { errored: false, point: next };
  }
}
