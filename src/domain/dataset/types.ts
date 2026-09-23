import type { ExprNode } from "../expr/ast";

/** A CSV loaded and embedded in the workspace (DESIGN.md §7/§16, Phase 7). */
export interface Dataset {
  columns: string[];
  rows: Record<string, number>[];
}

/** One statement of a compiled per-example loss (DESIGN.md §7): an ordered assignment, the last of which must define `loss`. */
export interface PerExampleLossStatement {
  name: string;
  expr: ExprNode;
}

export interface CompiledPerExampleLoss {
  statements: PerExampleLossStatement[];
}

/** One gradient-descent step's sample from a dataset (DESIGN.md §7's `GradientSource`), scoped to exactly the primary variables this workspace has (§4). */
export interface DatasetSample {
  batchGradient: Record<string, number>;
  batchLoss: number;
  fullGradient: Record<string, number>;
  fullLoss: number;
  epoch: number;
  batchIndex: number;
  examplesProcessed: number;
}
