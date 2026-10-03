import type { StateCreator } from "zustand";
import { loadCsv } from "../../domain/dataset/csv";
import { compilePerExampleLoss } from "../../domain/dataset/perExampleLoss";
import { SURFACE_PRIMARY_VARIABLES, type PrimaryVariable } from "../../domain/rules/ruleCompiler";
import { regenerateRulesForPrimaryVariables } from "../ruleEntries";
import type { DatasetSlice, WorkspaceMode, WorkspaceState } from "../workspaceState";

/** Presenter left the dataset-mode primary variables unnamed (DESIGN.md §4: "defaulting to theta_0, theta_1, ... if left unnamed"). */
export const DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES: [string, string] = ["theta_0", "theta_1"];

const DEFAULT_PER_EXAMPLE_LOSS_SOURCE = "prediction = theta_0 * feature + theta_1\nerror = prediction - target\nloss = error^2";
const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_RUN_TARGET_VALUE = 10;

/** `[x, y]` in surface mode; the presenter's named variables in dataset mode. */
export function primaryVariablesFor(mode: WorkspaceMode, datasetNames: readonly string[]): readonly PrimaryVariable[] {
  return mode === "surface" ? SURFACE_PRIMARY_VARIABLES : datasetNames.map((name) => ({ name }));
}

/** Keeps any values already entered for names that still exist, defaulting new/renamed primary variables to 0. */
function initialValuesFor(primaryVariables: readonly PrimaryVariable[], previous: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const v of primaryVariables) result[v.name] = previous[v.name] ?? 0;
  return result;
}

export const createDatasetSlice: StateCreator<WorkspaceState, [], [], DatasetSlice> = (set) => ({
  mode: "surface",
  primaryVariables: SURFACE_PRIMARY_VARIABLES,
  datasetPrimaryVariableNames: DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES,

  dataset: null,
  datasetFileName: null,
  datasetError: null,
  datasetWarning: null,

  perExampleLossSourceText: DEFAULT_PER_EXAMPLE_LOSS_SOURCE,
  perExampleLossErrors: [],
  activePerExampleLoss: null,

  datasetInitialValues: { [DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES[0]]: 0, [DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES[1]]: 0 },
  batchSize: DEFAULT_BATCH_SIZE,
  datasetRunTargetKind: "continuous",
  datasetRunTargetValue: DEFAULT_RUN_TARGET_VALUE,

  setMode: (mode) =>
    set((state) => {
      const primaryVariables = primaryVariablesFor(mode, state.datasetPrimaryVariableNames);
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

      const primaryVariables = primaryVariablesFor("dataset", names);
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
});
