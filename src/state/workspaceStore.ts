import { create } from "zustand";
import type { ExprNode } from "../domain/expr/ast";
import { loadCsv } from "../domain/dataset/csv";
import { compilePerExampleLoss } from "../domain/dataset/perExampleLoss";
import type { CompiledPerExampleLoss, Dataset } from "../domain/dataset/types";
import {
  parseLossFunction,
  parseManualGradientComponent,
  type LossFunctionError,
  type LossFunctionParseResult,
  type ResolvedLoss,
} from "../domain/lossFunction";
import { validateWorkspaceSnapshot, WORKSPACE_SCHEMA_VERSION, type WorkspaceSnapshot } from "../domain/persistence/workspaceSnapshot";
import { compileRule, SURFACE_PRIMARY_VARIABLES, type CompiledRule, type PrimaryVariable } from "../domain/rules/ruleCompiler";
import { parseRuleSource } from "../domain/rules/ruleParser";
import type { RuleError } from "../domain/rules/ruleTypes";
import { DEFAULT_SIM_LIMITS, type SimLimits } from "../domain/simulation/types";

export type CameraMode = "rotate" | "pan";
export type WorkspaceMode = "surface" | "dataset";
export type DatasetRunTargetKind = "continuous" | "epochs" | "seconds";

export const DEFAULT_LOSS_SOURCE = "(x - 3)^2 + 4*(y + 1)^2";

/**
 * The spec's own worked momentum example — exercises parameters, state, and
 * the persistent-recurrence mechanism (DESIGN.md §4, Phase 2). `eta` is
 * declared `log`-scale since a learning rate spanning four orders of
 * magnitude (0.0001–1) is the canonical case a log slider is for (Phase 3).
 */
const MOMENTUM_RULE_SOURCE = [
  "parameter eta = 0.01 range 0.0001 to 1 log",
  "parameter beta = 0.9 range 0 to 0.999",
  "state vx = 0",
  "state vy = 0",
  "vx_next = beta * vx - eta * gx",
  "vy_next = beta * vy - eta * gy",
  "x_next = x + vx_next",
  "y_next = y + vy_next",
  "vx = vx_next",
  "vy = vy_next",
].join("\n");

const PLAIN_GRADIENT_DESCENT_SOURCE = [
  "parameter eta = 0.1 range 0.0001 to 1 log",
  "x_next = x - eta * gx",
  "y_next = y - eta * gy",
].join("\n");

/** Cycled through when a new rule is added (DESIGN.md §12: "different editable colors for each trajectory"). */
export const RULE_COLOR_PALETTE = ["#ff6b35", "#4c9aff", "#7ee0a3", "#e0d17e", "#c792ea", "#5fd0e8"];

/** Presenter left the dataset-mode primary variables unnamed (DESIGN.md §4: "defaulting to theta_0, theta_1, ... if left unnamed"). */
export const DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES: [string, string] = ["theta_0", "theta_1"];

export interface RuleWorkspaceEntry {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  collapsed: boolean;
  sourceText: string;
  errors: RuleError[];
  /** Last successfully compiled rule — an invalid intermediate edit must not kill the current run (DESIGN.md §9). */
  activeCompiledRule: CompiledRule;
}

function compileRuleSource(
  source: string,
  primaryVariables: readonly PrimaryVariable[],
): { errors: RuleError[]; compiled: CompiledRule | null } {
  const { program, errors: parseErrors } = parseRuleSource(source);
  if (!program) return { errors: parseErrors, compiled: null };
  return compileRule(program, primaryVariables);
}

function mustCompile(source: string, primaryVariables: readonly PrimaryVariable[]): CompiledRule {
  const { compiled } = compileRuleSource(source, primaryVariables);
  if (!compiled) throw new Error(`Default rule source failed to compile: ${source}`);
  return compiled;
}

function makeRuleId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rule-${Math.random().toString(36).slice(2)}`;
}

function makeRule(name: string, color: string, sourceText: string, primaryVariables: readonly PrimaryVariable[]): RuleWorkspaceEntry {
  return {
    id: makeRuleId(),
    name,
    color,
    visible: true,
    collapsed: false,
    sourceText,
    errors: [],
    activeCompiledRule: mustCompile(sourceText, primaryVariables),
  };
}

/** A plain, always-compilable gradient-descent template for an arbitrary pair of primary variables (DESIGN.md §4/§7) — used for new rules in dataset mode, and to regenerate every rule when the workspace's primary-variable names change (renaming the optimized variables is a deliberate, disruptive action; existing rule text referencing the old names can't be reinterpreted automatically, so it's replaced with a working default rather than left erroring). */
function defaultRuleSourceFor(primaryVariables: readonly PrimaryVariable[]): string {
  const [a, b] = primaryVariables;
  return [
    "parameter eta = 0.1 range 0.0001 to 1 log",
    `${a.name}_next = ${a.name} - eta * g${a.name}`,
    `${b.name}_next = ${b.name} - eta * g${b.name}`,
  ].join("\n");
}

interface WorkspaceState {
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

  rules: RuleWorkspaceEntry[];

  startPoint: { x: number; y: number };
  cameraMode: CameraMode;
  /** Purely a view preference (collapses the contour/comparison panel into a slim right-edge tab) — not part of a saved workspace snapshot, same as scroll position wouldn't be. */
  secondaryPanelCollapsed: boolean;

  /** Shared by every rule (DESIGN.md §1/§10); each rule derives its own stream from this via `deriveSeed`. Default 42 per spec §8. */
  seed: number;
  /** Shared gradient-noise magnitude; 0 means no noise. Surface mode only — dataset mode's stochasticity comes from mini-batch sampling itself (§7). */
  noiseLevel: number;
  /** Divergence-safety and stopping configuration (DESIGN.md §12/§17), shared by every rule in both modes. */
  simLimits: SimLimits;
  /** Steps per second every rule is driven at — a single global control, never per rule. Takes effect immediately, like noise level. */
  stepsPerSecond: number;

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

  setLossSourceText: (text: string) => void;
  setManualGradientEnabled: (enabled: boolean) => void;
  setManualGradientGx: (text: string) => void;
  setManualGradientGy: (text: string) => void;
  addRule: () => void;
  removeRule: (id: string) => void;
  setRuleSourceText: (id: string, text: string) => void;
  setRuleName: (id: string, name: string) => void;
  setRuleColor: (id: string, color: string) => void;
  setRuleVisible: (id: string, visible: boolean) => void;
  setRuleCollapsed: (id: string, collapsed: boolean) => void;
  setStartPoint: (point: { x: number; y: number }) => void;
  setCameraMode: (mode: CameraMode) => void;
  setSecondaryPanelCollapsed: (collapsed: boolean) => void;
  setSeed: (seed: number) => void;
  setNoiseLevel: (level: number) => void;
  /** Merges a partial update into `simLimits` (e.g. one changed numeric field at a time from `RunControlsPanel`) rather than requiring every caller to spread the whole object. */
  setSimLimits: (partial: Partial<SimLimits>) => void;
  setStepsPerSecond: (stepsPerSecond: number) => void;

  setMode: (mode: WorkspaceMode) => void;
  setDatasetPrimaryVariableNames: (names: [string, string]) => void;
  loadDatasetFromFile: (file: File) => Promise<void>;
  setPerExampleLossSourceText: (text: string) => void;
  setDatasetInitialValue: (name: string, value: number) => void;
  /** Sets several initial values at once (e.g. both primary variables from a single drag gesture on the loss surface/contour) as one store update instead of one per name. */
  setDatasetInitialValues: (values: Readonly<Record<string, number>>) => void;
  setBatchSize: (size: number) => void;
  setDatasetRunTarget: (kind: DatasetRunTargetKind, value: number) => void;

  /** Serializes everything a saved workspace needs to reproduce itself (DESIGN.md §16/§18 Phase 8) — equations, every rule's own text, colors, and settings. Excludes ephemeral view state like `secondaryPanelCollapsed`. */
  exportSnapshot: () => WorkspaceSnapshot;
  /** Structurally validates `value` (via `validateWorkspaceSnapshot`) and, only if valid, re-parses/re-compiles every piece through the exact same pipeline live edits use before replacing the whole workspace atomically. Returns validation errors and leaves the current workspace untouched if the value is malformed. */
  loadWorkspaceSnapshot: (value: unknown) => { errors: string[] };
}

export const DEFAULT_SEED = 42;
/** Matches the fixed rate every rule stepped at before this became a presenter-facing global control. */
export const DEFAULT_STEPS_PER_SECOND = 4;

const initialLossParse = parseLossFunction(DEFAULT_LOSS_SOURCE);
if (!initialLossParse.ok) throw new Error("DEFAULT_LOSS_SOURCE must parse — this is a build-time invariant");
const initialActiveLoss: ResolvedLoss = {
  ast: initialLossParse.ast,
  mayBeNondifferentiable: initialLossParse.mayBeNondifferentiable,
  mayBeUndefinedForSomeInputs: initialLossParse.mayBeUndefinedForSomeInputs,
  symbolicGradient: initialLossParse.symbolicGradient,
  manualGradient: null,
};

/** Recombines the current loss-derived fields with the current manual-override fields into one `ResolvedLoss`. */
function recomputeActiveLoss(
  base: ResolvedLoss,
  manualGradientEnabled: boolean,
  gxAst: ExprNode | null,
  gyAst: ExprNode | null,
): ResolvedLoss {
  const manualGradient = manualGradientEnabled && gxAst && gyAst ? { gx: gxAst, gy: gyAst } : null;
  return { ...base, manualGradient };
}

let nextPaletteIndex = 0;
function nextPaletteColor(): string {
  const color = RULE_COLOR_PALETTE[nextPaletteIndex % RULE_COLOR_PALETTE.length];
  nextPaletteIndex += 1;
  return color;
}

/** Every rule's text/compiled form is replaced with the plain-gradient-descent default for the new primary variables — a rule written against `x`/`y` can't be reinterpreted against `weight`/`bias` (or vice versa), so switching modes or renaming dataset-mode variables resets rule text to a known-working default rather than leaving it erroring (DESIGN.md §4/§7, Phase 7). */
function regenerateRulesForPrimaryVariables(rules: RuleWorkspaceEntry[], primaryVariables: readonly PrimaryVariable[]): RuleWorkspaceEntry[] {
  const sourceText = defaultRuleSourceFor(primaryVariables);
  const { compiled } = compileRuleSource(sourceText, primaryVariables);
  if (!compiled) throw new Error("defaultRuleSourceFor produced an uncompilable rule — this is a build-time invariant");
  return rules.map((r) => ({ ...r, sourceText, errors: [], activeCompiledRule: compiled }));
}

/** Keeps any values already entered for names that still exist, defaulting new/renamed primary variables to 0. */
function initialValuesFor(primaryVariables: readonly PrimaryVariable[], previous: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const v of primaryVariables) result[v.name] = previous[v.name] ?? 0;
  return result;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  lossSourceText: DEFAULT_LOSS_SOURCE,
  lossParse: initialLossParse,
  activeLoss: initialActiveLoss,

  manualGradientEnabled: false,
  manualGradientGxSource: "",
  manualGradientGySource: "",
  manualGradientGxError: null,
  manualGradientGyError: null,
  manualGradientGxAst: null,
  manualGradientGyAst: null,

  rules: [
    makeRule("Momentum", nextPaletteColor(), MOMENTUM_RULE_SOURCE, SURFACE_PRIMARY_VARIABLES),
    makeRule("Gradient Descent", nextPaletteColor(), PLAIN_GRADIENT_DESCENT_SOURCE, SURFACE_PRIMARY_VARIABLES),
  ],

  startPoint: { x: 0, y: 0 },
  cameraMode: "rotate",
  secondaryPanelCollapsed: false,
  seed: DEFAULT_SEED,
  noiseLevel: 0,
  simLimits: DEFAULT_SIM_LIMITS,
  stepsPerSecond: DEFAULT_STEPS_PER_SECOND,

  mode: "surface",
  primaryVariables: SURFACE_PRIMARY_VARIABLES,
  datasetPrimaryVariableNames: DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES,

  dataset: null,
  datasetFileName: null,
  datasetError: null,
  datasetWarning: null,

  perExampleLossSourceText: "prediction = theta_0 * feature + theta_1\nerror = prediction - target\nloss = error^2",
  perExampleLossErrors: [],
  activePerExampleLoss: null,

  datasetInitialValues: { [DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES[0]]: 0, [DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES[1]]: 0 },
  batchSize: 8,
  datasetRunTargetKind: "continuous",
  datasetRunTargetValue: 10,

  setLossSourceText: (text) =>
    set((state) => {
      const parsed = parseLossFunction(text);
      if (!parsed.ok) return { lossSourceText: text, lossParse: parsed };
      const base: ResolvedLoss = {
        ast: parsed.ast,
        mayBeNondifferentiable: parsed.mayBeNondifferentiable,
        mayBeUndefinedForSomeInputs: parsed.mayBeUndefinedForSomeInputs,
        symbolicGradient: parsed.symbolicGradient,
        manualGradient: null,
      };
      return {
        lossSourceText: text,
        lossParse: parsed,
        activeLoss: recomputeActiveLoss(base, state.manualGradientEnabled, state.manualGradientGxAst, state.manualGradientGyAst),
      };
    }),

  setManualGradientEnabled: (enabled) =>
    set((state) => ({
      manualGradientEnabled: enabled,
      activeLoss: recomputeActiveLoss(state.activeLoss, enabled, state.manualGradientGxAst, state.manualGradientGyAst),
    })),

  setManualGradientGx: (text) =>
    set((state) => {
      const result = parseManualGradientComponent(text);
      const gxAst = result.ok ? result.ast : state.manualGradientGxAst;
      return {
        manualGradientGxSource: text,
        manualGradientGxError: result.ok ? null : result.error,
        manualGradientGxAst: gxAst,
        activeLoss: recomputeActiveLoss(state.activeLoss, state.manualGradientEnabled, gxAst, state.manualGradientGyAst),
      };
    }),

  setManualGradientGy: (text) =>
    set((state) => {
      const result = parseManualGradientComponent(text);
      const gyAst = result.ok ? result.ast : state.manualGradientGyAst;
      return {
        manualGradientGySource: text,
        manualGradientGyError: result.ok ? null : result.error,
        manualGradientGyAst: gyAst,
        activeLoss: recomputeActiveLoss(state.activeLoss, state.manualGradientEnabled, state.manualGradientGxAst, gyAst),
      };
    }),

  addRule: () =>
    set((state) => ({
      rules: [
        ...state.rules,
        makeRule(`Rule ${state.rules.length + 1}`, nextPaletteColor(), defaultRuleSourceFor(state.primaryVariables), state.primaryVariables),
      ],
    })),

  removeRule: (id) => set((state) => ({ rules: state.rules.filter((r) => r.id !== id) })),

  setRuleSourceText: (id, text) =>
    set((state) => ({
      rules: state.rules.map((r) => {
        if (r.id !== id) return r;
        const { errors, compiled } = compileRuleSource(text, state.primaryVariables);
        return { ...r, sourceText: text, errors, activeCompiledRule: compiled ?? r.activeCompiledRule };
      }),
    })),

  setRuleName: (id, name) => set((state) => ({ rules: state.rules.map((r) => (r.id === id ? { ...r, name } : r)) })),

  setRuleColor: (id, color) => set((state) => ({ rules: state.rules.map((r) => (r.id === id ? { ...r, color } : r)) })),

  setRuleVisible: (id, visible) => set((state) => ({ rules: state.rules.map((r) => (r.id === id ? { ...r, visible } : r)) })),

  setRuleCollapsed: (id, collapsed) =>
    set((state) => ({ rules: state.rules.map((r) => (r.id === id ? { ...r, collapsed } : r)) })),

  setStartPoint: (point) => set({ startPoint: point }),
  setCameraMode: (mode) => set({ cameraMode: mode }),
  setSecondaryPanelCollapsed: (collapsed) => set({ secondaryPanelCollapsed: collapsed }),
  setSeed: (seed) => set({ seed }),
  setNoiseLevel: (level) => set({ noiseLevel: level }),
  setSimLimits: (partial) => set((state) => ({ simLimits: { ...state.simLimits, ...partial } })),
  setStepsPerSecond: (stepsPerSecond) => set({ stepsPerSecond: Math.max(0.1, stepsPerSecond) }),

  setMode: (mode) =>
    set((state) => {
      const primaryVariables: readonly PrimaryVariable[] =
        mode === "surface" ? SURFACE_PRIMARY_VARIABLES : state.datasetPrimaryVariableNames.map((name) => ({ name }));
      return {
        mode,
        primaryVariables,
        rules: regenerateRulesForPrimaryVariables(state.rules, primaryVariables),
        datasetInitialValues: mode === "dataset" ? initialValuesFor(primaryVariables, state.datasetInitialValues) : state.datasetInitialValues,
      };
    }),

  setDatasetPrimaryVariableNames: (names) =>
    set((state) => {
      if (state.mode !== "dataset") return { datasetPrimaryVariableNames: names };

      const primaryVariables: readonly PrimaryVariable[] = names.map((name) => ({ name }));
      // `rules`/`datasetInitialValues` are always safe to advance to the
      // new names immediately — rules regenerate against a fresh, always-
      // compilable template (never reference dataset columns), and initial
      // values are just re-keyed. The one field that can go genuinely
      // unsafe is `activePerExampleLoss`: falling back to its old,
      // old-named compiled form here would pair it with the NEW
      // `primaryVariables` a runner samples coords from — the "Unknown
      // identifier" crash this bug produced live. So it's set to whatever
      // compiles against the new names, `null` if that fails (which keeps
      // `useDatasetRunners` from running, exactly like a dataset whose
      // columns don't match yet) — never the stale fallback.
      const perExampleLossResult = state.dataset
        ? compilePerExampleLoss(state.perExampleLossSourceText, primaryVariables, state.dataset.columns)
        : { compiled: null, errors: [] };

      return {
        datasetPrimaryVariableNames: names,
        primaryVariables,
        rules: regenerateRulesForPrimaryVariables(state.rules, primaryVariables),
        datasetInitialValues: initialValuesFor(primaryVariables, state.datasetInitialValues),
        perExampleLossErrors: perExampleLossResult.errors,
        activePerExampleLoss: perExampleLossResult.compiled,
      };
    }),

  loadDatasetFromFile: async (file) => {
    const text = await file.text();
    const { dataset, error, warning } = loadCsv(text, file.size);
    set((state) => {
      if (!dataset) {
        // A failed re-upload must not destroy an already-loaded, working
        // dataset (DESIGN.md §9's "don't kill a good state on a bad edit"
        // — the same rule applied to CSV loads, not just text edits).
        return { datasetFileName: file.name, datasetError: error, datasetWarning: null };
      }
      const perExampleLossResult = compilePerExampleLoss(state.perExampleLossSourceText, state.primaryVariables, dataset.columns);
      return {
        dataset,
        datasetFileName: file.name,
        datasetError: null,
        datasetWarning: warning,
        perExampleLossErrors: perExampleLossResult.errors,
        // Unlike a plain text-edit fallback, falling back to the OLD
        // compiled per-example loss here would pair it with a NEW dataset
        // whose columns it was never validated against — the "Unknown
        // identifier" crash this bug produced live (see workspaceStore
        // test "loading a dataset with different columns"). Null it out
        // instead so `useDatasetRunners`'s `ready` check stays false until
        // the presenter updates the per-example loss to match the new
        // columns.
        activePerExampleLoss: perExampleLossResult.compiled,
      };
    });
  },

  setPerExampleLossSourceText: (text) =>
    set((state) => {
      if (!state.dataset) return { perExampleLossSourceText: text };
      const result = compilePerExampleLoss(text, state.primaryVariables, state.dataset.columns);
      return {
        perExampleLossSourceText: text,
        perExampleLossErrors: result.errors,
        activePerExampleLoss: result.compiled ?? state.activePerExampleLoss,
      };
    }),

  setDatasetInitialValue: (name, value) => set((state) => ({ datasetInitialValues: { ...state.datasetInitialValues, [name]: value } })),

  setDatasetInitialValues: (values) => set((state) => ({ datasetInitialValues: { ...state.datasetInitialValues, ...values } })),

  setBatchSize: (size) => set({ batchSize: Math.max(1, Math.floor(size)) }),

  setDatasetRunTarget: (kind, value) => set({ datasetRunTargetKind: kind, datasetRunTargetValue: value }),

  exportSnapshot: () => {
    const state = get();
    return {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      mode: state.mode,
      lossSourceText: state.lossSourceText,
      manualGradientEnabled: state.manualGradientEnabled,
      manualGradientGxSource: state.manualGradientGxSource,
      manualGradientGySource: state.manualGradientGySource,
      rules: state.rules.map((r) => ({ name: r.name, color: r.color, visible: r.visible, collapsed: r.collapsed, sourceText: r.sourceText })),
      startPoint: state.startPoint,
      cameraMode: state.cameraMode,
      seed: state.seed,
      noiseLevel: state.noiseLevel,
      datasetPrimaryVariableNames: state.datasetPrimaryVariableNames,
      dataset: state.dataset,
      datasetFileName: state.datasetFileName,
      perExampleLossSourceText: state.perExampleLossSourceText,
      datasetInitialValues: state.datasetInitialValues,
      batchSize: state.batchSize,
      datasetRunTargetKind: state.datasetRunTargetKind,
      datasetRunTargetValue: state.datasetRunTargetValue,
      simLimits: state.simLimits,
      stepsPerSecond: state.stepsPerSecond,
    };
  },

  loadWorkspaceSnapshot: (value) => {
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    if (!snapshot) return { errors };

    const primaryVariables: readonly PrimaryVariable[] =
      snapshot.mode === "surface" ? SURFACE_PRIMARY_VARIABLES : snapshot.datasetPrimaryVariableNames.map((name) => ({ name }));

    // Every rule's OWN saved text is re-compiled against the snapshot's
    // primary variables — never regenerated to a default template, unlike
    // a live rename (DESIGN.md §9's rename-safety rule doesn't apply here:
    // a snapshot's rules were always written for its OWN saved
    // primaryVariables, so this should ordinarily just succeed). A rule
    // that still fails to compile (a hand-edited/corrupted file) falls
    // back to the same always-valid template `regenerateRulesForPrimaryVariables`
    // uses, so the workspace never loads into a broken state — its saved
    // text and errors are preserved and shown, exactly like any other
    // "don't crash on bad input" case in this app.
    const rules: RuleWorkspaceEntry[] = snapshot.rules.map((r) => {
      const { errors: ruleErrors, compiled } = compileRuleSource(r.sourceText, primaryVariables);
      return {
        id: makeRuleId(),
        name: r.name,
        color: r.color,
        visible: r.visible,
        collapsed: r.collapsed,
        sourceText: r.sourceText,
        errors: ruleErrors,
        activeCompiledRule: compiled ?? mustCompile(defaultRuleSourceFor(primaryVariables), primaryVariables),
      };
    });

    const lossParse = parseLossFunction(snapshot.lossSourceText);
    const activeLossBase: ResolvedLoss = lossParse.ok
      ? {
          ast: lossParse.ast,
          mayBeNondifferentiable: lossParse.mayBeNondifferentiable,
          mayBeUndefinedForSomeInputs: lossParse.mayBeUndefinedForSomeInputs,
          symbolicGradient: lossParse.symbolicGradient,
          manualGradient: null,
        }
      : initialActiveLoss;

    const gxResult = parseManualGradientComponent(snapshot.manualGradientGxSource);
    const gyResult = parseManualGradientComponent(snapshot.manualGradientGySource);
    const gxAst = gxResult.ok ? gxResult.ast : null;
    const gyAst = gyResult.ok ? gyResult.ast : null;

    const perExampleLossResult = snapshot.dataset
      ? compilePerExampleLoss(snapshot.perExampleLossSourceText, primaryVariables, snapshot.dataset.columns)
      : { compiled: null, errors: [] };

    set({
      lossSourceText: snapshot.lossSourceText,
      lossParse,
      activeLoss: recomputeActiveLoss(activeLossBase, snapshot.manualGradientEnabled, gxAst, gyAst),
      manualGradientEnabled: snapshot.manualGradientEnabled,
      manualGradientGxSource: snapshot.manualGradientGxSource,
      manualGradientGySource: snapshot.manualGradientGySource,
      manualGradientGxError: gxResult.ok ? null : gxResult.error,
      manualGradientGyError: gyResult.ok ? null : gyResult.error,
      manualGradientGxAst: gxAst,
      manualGradientGyAst: gyAst,
      rules,
      startPoint: snapshot.startPoint,
      cameraMode: snapshot.cameraMode,
      seed: snapshot.seed,
      noiseLevel: snapshot.noiseLevel,
      mode: snapshot.mode,
      primaryVariables,
      datasetPrimaryVariableNames: snapshot.datasetPrimaryVariableNames,
      dataset: snapshot.dataset,
      datasetFileName: snapshot.datasetFileName,
      datasetError: null,
      datasetWarning: null,
      perExampleLossSourceText: snapshot.perExampleLossSourceText,
      perExampleLossErrors: perExampleLossResult.errors,
      activePerExampleLoss: perExampleLossResult.compiled,
      datasetInitialValues: snapshot.datasetInitialValues,
      batchSize: snapshot.batchSize,
      datasetRunTargetKind: snapshot.datasetRunTargetKind,
      datasetRunTargetValue: snapshot.datasetRunTargetValue,
      simLimits: snapshot.simLimits,
      stepsPerSecond: snapshot.stepsPerSecond,
    });

    return { errors: [] };
  },
}));
