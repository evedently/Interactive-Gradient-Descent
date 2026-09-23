export interface DatasetTrajectoryPoint {
  iteration: number;
  elapsedMs: number;
  /** Current value of every primary variable (the model parameters being optimized, DESIGN.md §4/§7) — keyed by name, e.g. `{weight, bias}`. */
  coords: Record<string, number>;
  batchLoss: number;
  fullLoss: number;
  batchGradient: Record<string, number>;
  fullGradient: Record<string, number>;
  epoch: number;
  batchIndex: number;
  examplesProcessed: number;
}

/** Stops a continuous run automatically once the target is reached (DESIGN.md §18 Phase 7's "epochs/seconds run modes"). `null` runs indefinitely, like surface mode. */
export type DatasetRunTarget = { kind: "epochs"; value: number } | { kind: "seconds"; value: number } | null;
