export interface TrajectoryPoint {
  iteration: number;
  elapsedMs: number;
  x: number;
  y: number;
  loss: number;
  /** The true (noiseless) analytic/symbolic/numeric/manual gradient at this point — always self-consistent with x,y. */
  gx: number;
  gy: number;
  /**
   * What the update rule actually saw as `gx`/`gy` this step (DESIGN.md
   * §8/§10): `gx + noiseLevel * normal()`, drawn once when this point was
   * created. Equal to `gx`/`gy` whenever noise is off.
   */
  noisyGx: number;
  noisyGy: number;
}

export type RunnerStatus = "idle" | "running" | "paused" | "error";

/**
 * Divergence-safety and stopping configuration (DESIGN.md §12/§17), shared
 * by `SimulationRunner` and `DatasetSimulationRunner` — surface mode checks
 * it against `x`/`y`, dataset mode against every primary variable's
 * coordinate and the full-dataset loss, but the values themselves are the
 * same workspace-level (never per-rule) settings either way.
 *
 * Two different kinds of field live here:
 * - `maxAbsPrimaryVariableValue`/`maxAbsLoss` are genuine DIVERGENCE bounds
 *   — crossing one means the run blew up, so the runner enters `'error'`
 *   status and preserves its last valid state.
 * - `maxIterations`/`earlyStopLossThreshold` are STOPPING criteria a
 *   presenter opts into — reaching either just pauses a clean, valid run,
 *   never an error.
 */
export interface SimLimits {
  /** Stop once this many iterations have run. A presenter-facing global control (not per rule); `undefined` means uncapped. */
  maxIterations?: number;
  /** Any primary variable's `|value|` beyond this stops the run (decision 6 default: 1,000,000). */
  maxAbsPrimaryVariableValue: number;
  /** Loss beyond this stops the run (decision 6 default: 1,000,000,000,000). */
  maxAbsLoss: number;
  /** Early stopping: once loss drops to or below this, the run pauses cleanly — this is success, not divergence. `undefined` disables early stopping. */
  earlyStopLossThreshold?: number;
}

export const DEFAULT_SIM_LIMITS: SimLimits = {
  maxIterations: 200_000,
  maxAbsPrimaryVariableValue: 1_000_000,
  maxAbsLoss: 1_000_000_000_000,
  earlyStopLossThreshold: undefined,
};

export type PendingUpdateResult =
  | { ok: true; dx: number; dy: number; newX: number; newY: number; pendingState: Record<string, number> }
  | { ok: false; message: string };

export interface StepResult {
  errored: boolean;
  message?: string;
  point?: TrajectoryPoint;
}
