import type { StateCreator } from "zustand";
import { defaultColumnsFor } from "../../domain/dataset/columnMapping";
import { loadCsv } from "../../domain/dataset/csv";
import { modelParameterNames, resolveDatasetModel, type DatasetModelConfig } from "../../domain/dataset/datasetModel";
import { isTemplateKind, MODEL_TEMPLATES, type ModelKind } from "../../domain/dataset/modelTemplates";
import type { Dataset } from "../../domain/dataset/types";
import { SURFACE_PRIMARY_VARIABLES, type PrimaryVariable } from "../../domain/rules/ruleCompiler";
import { shallowEqualArrays } from "../../lib/arrays";
import { regenerateRulesForPrimaryVariables } from "../ruleEntries";
import type { DatasetSlice, WorkspaceMode, WorkspaceState } from "../workspaceState";

/** Presenter left the custom model's parameters unnamed (DESIGN.md §4: "defaulting to theta_0, theta_1, ... if left unnamed"). */
export const DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES: [string, string] = ["theta_0", "theta_1"];

const DEFAULT_CUSTOM_SOURCE = "prediction = theta_0 * x + theta_1\nerror = prediction - y\nloss = error^2";
const DEFAULT_MODEL_KIND: ModelKind = "linear";
const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_RUN_TARGET_VALUE = 10;

/** `[x, y]` in surface mode; the model's parameters in dataset mode. */
export function primaryVariablesFor(
  mode: WorkspaceMode,
  modelKind: ModelKind,
  customParameterNames: [string, string],
): readonly PrimaryVariable[] {
  return mode === "surface" ? SURFACE_PRIMARY_VARIABLES : modelParameterNames(modelKind, customParameterNames).map((name) => ({ name }));
}

/** Keeps any values already entered for names that still exist, defaulting new/renamed primary variables to 0. */
function initialValuesFor(primaryVariables: readonly PrimaryVariable[], previous: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const v of primaryVariables) result[v.name] = previous[v.name] ?? 0;
  return result;
}

function modelConfigOf(state: WorkspaceState): DatasetModelConfig {
  return {
    sourceDataset: state.sourceDataset,
    modelKind: state.modelKind,
    inputColumn: state.inputColumn,
    targetColumn: state.targetColumn,
    customSourceText: state.perExampleLossSourceText,
    customParameterNames: state.datasetPrimaryVariableNames,
  };
}

/**
 * Re-resolves the dataset model after any change to its inputs (`changes`
 * merged over `state`) and returns the whole store patch: the changed
 * inputs, the mapped dataset and compiled formula, and — in dataset mode,
 * only when the parameter names actually changed — regenerated rules and
 * re-keyed initial values. Switching between templates (both `w`, `b`)
 * therefore keeps every rule's text.
 *
 * The compiled formula is always exactly what compiles against the NEW
 * inputs, `null` if that fails — never a stale fallback, which would pair
 * an old formula with new columns or parameter names (the "Unknown
 * identifier" crash). The one exception is a custom-text typo; see
 * `setPerExampleLossSourceText`.
 */
function resolveModelPatch(state: WorkspaceState, changes: Partial<WorkspaceState>): Partial<WorkspaceState> {
  const next = { ...state, ...changes };
  const model = resolveDatasetModel(modelConfigOf(next));
  const patch: Partial<WorkspaceState> = {
    ...changes,
    dataset: model.dataset,
    activePerExampleLoss: model.compiled,
    perExampleLossErrors: model.formulaErrors,
    modelDataError: model.dataError,
    modelDefinesPrediction: model.definesPrediction,
  };
  if (next.mode !== "dataset") return patch;

  const names = model.primaryVariables.map((v) => v.name);
  if (shallowEqualArrays(names, state.primaryVariables.map((v) => v.name))) return patch;
  return {
    ...patch,
    primaryVariables: model.primaryVariables,
    rules: regenerateRulesForPrimaryVariables(state.rules, model.primaryVariables),
    datasetInitialValues: initialValuesFor(model.primaryVariables, state.datasetInitialValues),
  };
}

function datasetLoadPatch(state: WorkspaceState, dataset: Dataset, fileName: string, warning: string | null): Partial<WorkspaceState> {
  const columns = defaultColumnsFor(dataset.columns, state.inputColumn, state.targetColumn);
  return resolveModelPatch(state, {
    sourceDataset: dataset,
    datasetFileName: fileName,
    datasetError: null,
    datasetWarning: warning,
    inputColumn: columns.input,
    targetColumn: columns.target,
  });
}

/** A failed load must not destroy an already-loaded, working dataset (DESIGN.md §9's "don't kill a good state on a bad edit"). */
function failedLoadPatch(fileName: string, error: string | null): Partial<WorkspaceState> {
  return { datasetFileName: fileName, datasetError: error, datasetWarning: null };
}

export const createDatasetSlice: StateCreator<WorkspaceState, [], [], DatasetSlice> = (set) => ({
  mode: "surface",
  primaryVariables: SURFACE_PRIMARY_VARIABLES,
  datasetPrimaryVariableNames: DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES,

  modelKind: DEFAULT_MODEL_KIND,
  inputColumn: null,
  targetColumn: null,

  sourceDataset: null,
  dataset: null,
  datasetFileName: null,
  datasetError: null,
  datasetWarning: null,
  modelDataError: null,

  perExampleLossSourceText: DEFAULT_CUSTOM_SOURCE,
  perExampleLossErrors: [],
  activePerExampleLoss: null,
  modelDefinesPrediction: false,

  focusedRuleId: null,
  parameterHover: null,
  predictInput: null,

  datasetInitialValues: Object.fromEntries(modelParameterNames(DEFAULT_MODEL_KIND, DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES).map((n) => [n, 0])),
  batchSize: DEFAULT_BATCH_SIZE,
  datasetRunTargetKind: "continuous",
  datasetRunTargetValue: DEFAULT_RUN_TARGET_VALUE,

  setMode: (mode) =>
    set((state) => {
      const primaryVariables = primaryVariablesFor(mode, state.modelKind, state.datasetPrimaryVariableNames);
      return {
        mode,
        primaryVariables,
        rules: regenerateRulesForPrimaryVariables(state.rules, primaryVariables),
        datasetInitialValues: mode === "dataset" ? initialValuesFor(primaryVariables, state.datasetInitialValues) : state.datasetInitialValues,
      };
    }),

  setDatasetPrimaryVariableNames: (names) => set((state) => resolveModelPatch(state, { datasetPrimaryVariableNames: names })),

  setModelKind: (kind) => set((state) => resolveModelPatch(state, { modelKind: kind })),

  setColumnMapping: (inputColumn, targetColumn) => set((state) => resolveModelPatch(state, { inputColumn, targetColumn })),

  customizeTemplate: () =>
    set((state) => {
      if (!isTemplateKind(state.modelKind)) return {};
      const template = MODEL_TEMPLATES[state.modelKind];
      return resolveModelPatch(state, {
        modelKind: "custom",
        perExampleLossSourceText: template.sourceText,
        datasetPrimaryVariableNames: modelParameterNames(template.kind, state.datasetPrimaryVariableNames),
      });
    }),

  loadDatasetFromFile: async (file) => {
    const text = await file.text();
    const { dataset, error, warning } = loadCsv(text, file.size);
    set((state) => (dataset ? datasetLoadPatch(state, dataset, file.name, warning) : failedLoadPatch(file.name, error)));
  },

  loadDatasetFromText: (text, fileName, preset) => {
    const { dataset, error, warning } = loadCsv(text, new Blob([text]).size);
    set((state) => {
      if (!dataset) return failedLoadPatch(fileName, error);
      const presetState = preset ? { ...state, modelKind: preset.modelKind, inputColumn: preset.inputColumn, targetColumn: preset.targetColumn } : state;
      const patch = datasetLoadPatch(presetState, dataset, fileName, warning);
      return preset ? { ...patch, modelKind: preset.modelKind } : patch;
    });
  },

  setPerExampleLossSourceText: (text) =>
    set((state) => {
      const patch = resolveModelPatch(state, { perExampleLossSourceText: text });
      // A typo mid-edit must not kill a running custom model (DESIGN.md §9):
      // keep the last compiled formula, which was compiled against these
      // same columns and parameter names — only the text changed.
      const typoInCustomText = state.modelKind === "custom" && !patch.activePerExampleLoss && !patch.modelDataError;
      return typoInCustomText ? { ...patch, activePerExampleLoss: state.activePerExampleLoss } : patch;
    }),

  setDatasetInitialValue: (name, value) => set((state) => ({ datasetInitialValues: { ...state.datasetInitialValues, [name]: value } })),

  setDatasetInitialValues: (values) => set((state) => ({ datasetInitialValues: { ...state.datasetInitialValues, ...values } })),

  setBatchSize: (size) => set({ batchSize: Math.max(1, Math.floor(size)) }),

  setDatasetRunTarget: (kind, value) => set({ datasetRunTargetKind: kind, datasetRunTargetValue: value }),

  setFocusedRuleId: (id) => set({ focusedRuleId: id }),

  setParameterHover: (coords) => set({ parameterHover: coords }),

  setPredictInput: (x) => set({ predictInput: x }),
});
