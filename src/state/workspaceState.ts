import type { CompiledPerExampleLoss, Dataset } from "../domain/dataset/types";
import type { ExprNode } from "../domain/expr/ast";
import type { LossFunctionError, LossFunctionParseResult, ResolvedLoss } from "../domain/lossFunction";
import type { WorkspaceSnapshot } from "../domain/persistence/workspaceSnapshot";
import type { PrimaryVariable } from "../domain/rules/ruleCompiler";
import type { RuleError } from "../domain/rules/ruleTypes";
import type { SimLimits } from "../domain/simulation/types";
import type { GridBounds } from "../domain/visualization/grid";
import type { RuleWorkspaceEntry } from "./ruleEntries";

/*
 * Every slice's shape, in one types-only module, so slice files can type
 * `set`/`get` against the whole store without importing each other.
 */

export type CameraMode = "rotate" | "pan";
export type WorkspaceMode = "surface" | "dataset";
export type DatasetRunTargetKind = "continuous" | "epochs" | "seconds";

/** The shared loss function and its optional manual gradient override (DESIGN.md §1/§5). */
export interface LossSlice {
  lossSourceText: string;
  lossParse: LossFunctionParseResult;
  /**
   * Last successfully parsed loss, combined with the current manual
   * gradient override (if any) — only this triggers rebuilding runners
   * (DESIGN.md §9). An invalid intermediate edit to either the loss text
   * or the manual gx/gy fields must not disturb it.
   */
  activeLoss: ResolvedLoss;

  manualGradientEnabled: boolean;
  manualGradientGxSource: string;
  manualGradientGySource: string;
  manualGradientGxError: LossFunctionError | null;
  manualGradientGyError: LossFunctionError | null;
  /** Last successfully parsed manual gx/gy — same "don't kill it on a typo" rule. */
  manualGradientGxAst: ExprNode | null;
  manualGradientGyAst: ExprNode | null;

  setLossSourceText: (text: string) => void;
  setManualGradientEnabled: (enabled: boolean) => void;
  setManualGradientGx: (text: string) => void;
  setManualGradientGy: (text: string) => void;
}

/** The rule list: each rule's text, compiled form, and presentation (DESIGN.md §18 Phase 4). */
export interface RulesSlice {
  rules: RuleWorkspaceEntry[];

  addRule: () => void;
  removeRule: (id: string) => void;
  setRuleSourceText: (id: string, text: string) => void;
  setRuleName: (id: string, name: string) => void;
  setRuleColor: (id: string, color: string) => void;
  setRuleVisible: (id: string, visible: boolean) => void;
  setRuleCollapsed: (id: string, collapsed: boolean) => void;
  /** Moves rule `id` to position `toIndex` (clamped) in the rule list — the drag-to-reorder handle in each rule panel's header. Unknown ids are ignored. */
  moveRule: (id: string, toIndex: number) => void;
}

/** Workspace-wide simulation and view settings shared by every rule. */
export interface SettingsSlice {
  startPoint: { x: number; y: number };
  cameraMode: CameraMode;
  /** Purely a view preference (collapses the contour/comparison panel into a slim right-edge tab) — not part of a saved workspace snapshot, same as scroll position wouldn't be. */
  secondaryPanelCollapsed: boolean;
  /**
   * Surface mode's 3D/contour view bounds (DESIGN.md §8) — presenter-
   * configurable so a loss function whose interesting landscape sits well
   * inside or well outside the default ±10 window is still visible.
   * Purely a rendering-domain setting: changing it never stops or resets
   * any simulation (§9's "change visualization bounds ... does not stop or
   * reset"). Dataset mode has its own independent auto-fit bounds (§7) and
   * is unaffected by this field.
   */
  surfaceBounds: GridBounds;
  /** Shared by every rule (DESIGN.md §1/§10); each rule derives its own stream from this via `deriveSeed`. Default 42 per spec §8. */
  seed: number;
  /** Shared gradient-noise magnitude; 0 means no noise. Surface mode only — dataset mode's stochasticity comes from mini-batch sampling itself (§7). */
  noiseLevel: number;
  /** Divergence-safety and stopping configuration (DESIGN.md §12/§17), shared by every rule in both modes. */
  simLimits: SimLimits;
  /** Steps per second every rule is driven at — a single global control, never per rule. Takes effect immediately, like noise level. */
  stepsPerSecond: number;

  setStartPoint: (point: { x: number; y: number }) => void;
  setCameraMode: (mode: CameraMode) => void;
  setSecondaryPanelCollapsed: (collapsed: boolean) => void;
  setSurfaceBounds: (bounds: GridBounds) => void;
  setSeed: (seed: number) => void;
  setNoiseLevel: (level: number) => void;
  /** Merges a partial update into `simLimits` (e.g. one changed numeric field at a time from `RunControlsPanel`) rather than requiring every caller to spread the whole object. */
  setSimLimits: (partial: Partial<SimLimits>) => void;
  setStepsPerSecond: (stepsPerSecond: number) => void;
}

/** Surface vs. dataset mode, and everything dataset mode needs (DESIGN.md §7/§18 Phase 7). */
export interface DatasetSlice {
  /** Surface (the permanent default, §7) vs. dataset (Phase 7, §18). Switching modes regenerates every rule's text against the new primary variables (see `defaultRuleSourceFor`). */
  mode: WorkspaceMode;
  /** `[x, y]` in surface mode (fixed); the presenter's named model parameters in dataset mode (DESIGN.md §4). Every rule is compiled against this list. */
  primaryVariables: readonly PrimaryVariable[];
  /** Only meaningful in dataset mode; preserved across a switch back to surface mode so re-entering dataset mode doesn't lose the presenter's naming. */
  datasetPrimaryVariableNames: [string, string];

  dataset: Dataset | null;
  datasetFileName: string | null;
  datasetError: string | null;
  datasetWarning: string | null;

  perExampleLossSourceText: string;
  perExampleLossErrors: RuleError[];
  /** Last successfully compiled per-example loss — same "don't kill it on a typo" rule as `activeLoss` (DESIGN.md §9). */
  activePerExampleLoss: CompiledPerExampleLoss | null;

  /** Numeric-only initial values for the primary variables in dataset mode — there is no draggable start point (§7). */
  datasetInitialValues: Record<string, number>;
  /** Mini-batch size for `DatasetGradientSource` sampling; takes effect on the next sample, like a parameter (no reset needed). */
  batchSize: number;
  /** "Epochs"/"seconds" run modes (§18 Phase 7): stops a continuous run automatically once reached. `"continuous"` runs indefinitely, like surface mode. */
  datasetRunTargetKind: DatasetRunTargetKind;
  datasetRunTargetValue: number;

  setMode: (mode: WorkspaceMode) => void;
  setDatasetPrimaryVariableNames: (names: [string, string]) => void;
  loadDatasetFromFile: (file: File) => Promise<void>;
  setPerExampleLossSourceText: (text: string) => void;
  setDatasetInitialValue: (name: string, value: number) => void;
  /** Sets several initial values at once (e.g. both primary variables from a single drag gesture on the loss surface/contour) as one store update instead of one per name. */
  setDatasetInitialValues: (values: Readonly<Record<string, number>>) => void;
  setBatchSize: (size: number) => void;
  setDatasetRunTarget: (kind: DatasetRunTargetKind, value: number) => void;
}

/** Save/load of a whole workspace (DESIGN.md §16/§18 Phase 8). */
export interface PersistenceSlice {
  /** Serializes everything a saved workspace needs to reproduce itself — equations, every rule's own text, colors, and settings. Excludes ephemeral view state like `secondaryPanelCollapsed`. */
  exportSnapshot: () => WorkspaceSnapshot;
  /** Structurally validates `value` (via `validateWorkspaceSnapshot`) and, only if valid, re-parses/re-compiles every piece through the exact same pipeline live edits use before replacing the whole workspace atomically. Returns validation errors and leaves the current workspace untouched if the value is malformed. */
  loadWorkspaceSnapshot: (value: unknown) => { errors: string[] };
}

export type WorkspaceState = LossSlice & RulesSlice & SettingsSlice & DatasetSlice & PersistenceSlice;
