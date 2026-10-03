import { computeLossGradient, evaluateLoss, type ResolvedLoss } from "../lossFunction";
import type { CompiledRule } from "../rules/ruleCompiler";
import { RuleRunnerBase, type PeekFailure } from "./RuleRunnerBase";
import { DEFAULT_SIM_LIMITS, type PendingUpdateResult, type SimLimits, type TrajectoryPoint } from "./types";

type SurfacePeek = Extract<PendingUpdateResult, { ok: true }>;

/**
 * Drives one update rule against one loss function (DESIGN.md §6). Not a
 * React object: this class has no rendering dependency so it can be unit
 * tested directly and, later, moved behind a Web Worker without a rewrite.
 * A React hook drives it via `subscribe`/`step`/`play`/`pause`/`reset`;
 * everything shared with dataset mode lives in `RuleRunnerBase`.
 *
 * Noise and reproducibility (DESIGN.md §10, Phase 6): `seed` is this
 * rule's own *derived* seed (see `deriveSeed` — callers pass
 * `deriveSeed(workspaceSeed, ruleId)`, never the raw workspace seed
 * directly), so this runner's stochastic sequence never depends on which
 * other rules exist. A noisy gradient sample is drawn exactly once per new
 * trajectory point (in `snapshotAt`, reached from the constructor, `reset`,
 * and `step` — never from `peekUpdate`), so calling `peekUpdate` repeatedly
 * (e.g. every render frame while paused) never perturbs the RNG.
 */
export class SimulationRunner extends RuleRunnerBase<TrajectoryPoint, SurfacePeek> {
  constructor(
    private loss: ResolvedLoss,
    compiledRule: CompiledRule,
    private startPoint: { x: number; y: number },
    seed: number,
    private noiseLevel: number,
    simLimits: SimLimits = DEFAULT_SIM_LIMITS,
  ) {
    super(compiledRule, seed, simLimits);
    this.trajectory = [this.initialSnapshot()];
  }

  /** Noise level takes effect on the *next* step, like a parameter — no reset needed (DESIGN.md §10). */
  setNoiseLevel(level: number): void {
    this.noiseLevel = level;
    this.notify();
  }

  /** Updates the shared starting point (e.g. after a drag, DESIGN.md §9). Takes effect on the next Reset. */
  setStartPoint(point: { x: number; y: number }): void {
    this.startPoint = point;
  }

  /** Never touches the RNG — the noisy gradient it uses was already drawn when `current` was created. */
  peekUpdate(): SurfacePeek | PeekFailure {
    const cur = this.current;
    const result = this.evaluateBody(cur);
    if (!result.ok) return result;
    const newX = result.scope["x_next"];
    const newY = result.scope["y_next"];
    return { ok: true, dx: newX - cur.x, dy: newY - cur.y, newX, newY, pendingState: this.pendingStateFrom(result.scope) };
  }

  protected initialSnapshot(): TrajectoryPoint {
    return this.snapshotAt(this.startPoint.x, this.startPoint.y, 0, 0);
  }

  protected snapshotAfter(peek: SurfacePeek, iteration: number, elapsedMs: number): TrajectoryPoint {
    return this.snapshotAt(peek.newX, peek.newY, iteration, elapsedMs);
  }

  protected buildStepScope(cur: TrajectoryPoint): Record<string, number> {
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

  protected numericFields(p: TrajectoryPoint): number[] {
    return [p.x, p.y, p.loss, p.gx, p.gy, p.noisyGx, p.noisyGy];
  }

  protected primaryValues(p: TrajectoryPoint): number[] {
    return [p.x, p.y];
  }

  protected stoppingLoss(p: TrajectoryPoint): number {
    return p.loss;
  }

  /** The base class already recreated `this.rng`; surface sampling has no other state to reset. */
  protected resetSampling(): void {}

  /** Computes loss/true-gradient at (x,y) and draws exactly one fresh noise sample — the only place this runner reads from its RNG. */
  private snapshotAt(x: number, y: number, iteration: number, elapsedMs: number): TrajectoryPoint {
    const loss = evaluateLoss(this.loss.ast, x, y);
    const { gx, gy } = computeLossGradient(this.loss, x, y);
    const noisyGx = gx + this.noiseLevel * this.rng.normal();
    const noisyGy = gy + this.noiseLevel * this.rng.normal();
    return { iteration, elapsedMs, x, y, loss, gx, gy, noisyGx, noisyGy };
  }
}
