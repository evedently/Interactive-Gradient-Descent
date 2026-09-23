import { numericGradientN } from "../expr/numericGradient";
import type { PrimaryVariable } from "../rules/ruleCompiler";
import type { SeededRng } from "../simulation/SeededRng";
import { evaluatePerExampleLossForRow } from "./evaluatePerExampleLoss";
import type { CompiledPerExampleLoss, Dataset, DatasetSample } from "./types";

/** Central-difference step for the per-example-loss gradient (DESIGN.md §7: "same differentiation engine as §5"). A multi-statement per-example loss is differentiated numerically rather than symbolically — §5's symbolic engine only ever differentiates a single expression tree, and building one for an arbitrary assignment sequence is materially more machinery than a numeric fallback that already meets the same tolerance-based correctness bar (§5/§10). */
const GRADIENT_EPSILON = 1e-4;

/**
 * Computes and samples the mini-batch/full gradient of a per-example loss
 * over a `Dataset` (DESIGN.md §7's `DatasetGradientSource`). Rows are
 * shuffled once per epoch via the runner's seeded RNG so batches are
 * reproducible for a given seed (DESIGN.md §10), and epoch/batch-index/
 * examples-processed are tracked internally exactly as §7 specifies.
 *
 * `fullGradient`/`fullLoss` are computed over every row on every `sample()`
 * call. For a teaching-tool-sized CSV (bounded by the ~25MB embed limit,
 * §16) this is deliberately simple rather than incrementally cached —
 * performance work against larger datasets is Phase 9 scope, not this one.
 */
export class DatasetGradientSource {
  private epoch = 0;
  private batchIndex = 0;
  private examplesProcessed = 0;
  private shuffledRowIndices: number[];
  private cursor = 0;

  constructor(
    private readonly dataset: Dataset,
    private readonly perExampleLoss: CompiledPerExampleLoss,
    private readonly primaryVariables: readonly PrimaryVariable[],
    private batchSize: number,
    private rng: SeededRng,
  ) {
    this.shuffledRowIndices = this.shuffleRowIndices();
  }

  setBatchSize(batchSize: number): void {
    this.batchSize = Math.max(1, Math.floor(batchSize));
  }

  /** Restarts epoch/batch tracking and re-derives the row shuffle from a fresh RNG (called on the owning runner's Reset). */
  reset(rng: SeededRng): void {
    this.rng = rng;
    this.epoch = 0;
    this.batchIndex = 0;
    this.examplesProcessed = 0;
    this.cursor = 0;
    this.shuffledRowIndices = this.shuffleRowIndices();
  }

  private shuffleRowIndices(): number[] {
    const indices = this.dataset.rows.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }

  private evaluateRowLoss(row: Record<string, number>, coords: Readonly<Record<string, number>>): number {
    return evaluatePerExampleLossForRow(this.perExampleLoss, coords, row);
  }

  private aggregateOverRows(
    rowIndices: readonly number[],
    coords: Readonly<Record<string, number>>,
  ): { loss: number; gradient: Record<string, number> } {
    const names = this.primaryVariables.map((v) => v.name);
    const gradientSum: Record<string, number> = {};
    for (const name of names) gradientSum[name] = 0;
    let lossSum = 0;

    for (const rowIndex of rowIndices) {
      const row = this.dataset.rows[rowIndex];
      lossSum += this.evaluateRowLoss(row, coords);
      const rowGradient = numericGradientN((c) => this.evaluateRowLoss(row, c), coords, names, GRADIENT_EPSILON);
      for (const name of names) gradientSum[name] += rowGradient[name];
    }

    const n = rowIndices.length;
    const gradient: Record<string, number> = {};
    for (const name of names) gradient[name] = gradientSum[name] / n;
    return { loss: lossSum / n, gradient };
  }

  /** Advances the epoch/batch cursor by one mini-batch and returns both the batch and full-dataset gradient/loss at `coords` (DESIGN.md §7). */
  sample(coords: Readonly<Record<string, number>>): DatasetSample {
    const batchRowIndices: number[] = [];
    for (let i = 0; i < this.batchSize; i++) {
      if (this.cursor >= this.shuffledRowIndices.length) {
        this.shuffledRowIndices = this.shuffleRowIndices();
        this.cursor = 0;
        this.epoch += 1;
        this.batchIndex = 0;
      }
      batchRowIndices.push(this.shuffledRowIndices[this.cursor]);
      this.cursor += 1;
    }
    this.examplesProcessed += batchRowIndices.length;
    this.batchIndex += 1;

    const batch = this.aggregateOverRows(batchRowIndices, coords);
    const full = this.aggregateOverRows(this.dataset.rows.map((_, i) => i), coords);

    return {
      batchGradient: batch.gradient,
      batchLoss: batch.loss,
      fullGradient: full.gradient,
      fullLoss: full.loss,
      epoch: this.epoch,
      batchIndex: this.batchIndex,
      examplesProcessed: this.examplesProcessed,
    };
  }
}
