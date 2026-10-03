import type { StateCreator } from "zustand";
import { resolveDatasetModel } from "../../domain/dataset/datasetModel";
import { parseLossFunction, parseManualGradientComponent } from "../../domain/lossFunction";
import { validateWorkspaceSnapshot, WORKSPACE_SCHEMA_VERSION, type WorkspaceSnapshot } from "../../domain/persistence/workspaceSnapshot";
import type { PrimaryVariable } from "../../domain/rules/ruleCompiler";
import { baseLossFrom, INITIAL_ACTIVE_LOSS, recomputeActiveLoss } from "../resolvedLoss";
import { compileRuleSource, defaultRuleSourceFor, makeRuleId, mustCompile, type RuleWorkspaceEntry } from "../ruleEntries";
import type { PersistenceSlice, WorkspaceState } from "../workspaceState";
import { primaryVariablesFor } from "./datasetSlice";

/**
 * Every rule's OWN saved text is re-compiled against the snapshot's
 * primary variables — never regenerated to a default template, unlike a
 * live rename (DESIGN.md §9's rename-safety rule doesn't apply here: a
 * snapshot's rules were always written for its OWN saved primaryVariables,
 * so this should ordinarily just succeed). A rule that still fails to
 * compile (a hand-edited/corrupted file) falls back to the same
 * always-valid template a rename uses, so the workspace never loads into a
 * broken state — its saved text and errors are preserved and shown.
 */
function rulesFromSnapshot(snapshot: WorkspaceSnapshot, primaryVariables: readonly PrimaryVariable[]): RuleWorkspaceEntry[] {
  return snapshot.rules.map((r) => {
    const { errors, compiled } = compileRuleSource(r.sourceText, primaryVariables);
    return {
      id: makeRuleId(),
      name: r.name,
      color: r.color,
      visible: r.visible,
      collapsed: r.collapsed,
      sourceText: r.sourceText,
      errors,
      activeCompiledRule: compiled ?? mustCompile(defaultRuleSourceFor(primaryVariables), primaryVariables),
    };
  });
}

/** The loss-slice fields a snapshot restores, re-parsed through the same pipeline live edits use. */
function lossStateFromSnapshot(snapshot: WorkspaceSnapshot): Partial<WorkspaceState> {
  const lossParse = parseLossFunction(snapshot.lossSourceText);
  const gxResult = parseManualGradientComponent(snapshot.manualGradientGxSource);
  const gyResult = parseManualGradientComponent(snapshot.manualGradientGySource);
  const gxAst = gxResult.ok ? gxResult.ast : null;
  const gyAst = gyResult.ok ? gyResult.ast : null;
  const base = lossParse.ok ? baseLossFrom(lossParse) : INITIAL_ACTIVE_LOSS;

  return {
    lossSourceText: snapshot.lossSourceText,
    lossParse,
    activeLoss: recomputeActiveLoss(base, snapshot.manualGradientEnabled, gxAst, gyAst),
    manualGradientEnabled: snapshot.manualGradientEnabled,
    manualGradientGxSource: snapshot.manualGradientGxSource,
    manualGradientGySource: snapshot.manualGradientGySource,
    manualGradientGxError: gxResult.ok ? null : gxResult.error,
    manualGradientGyError: gyResult.ok ? null : gyResult.error,
    manualGradientGxAst: gxAst,
    manualGradientGyAst: gyAst,
  };
}

/** The dataset-slice fields a snapshot restores, with the model re-resolved through the same path live edits use. */
function datasetStateFromSnapshot(snapshot: WorkspaceSnapshot, primaryVariables: readonly PrimaryVariable[]): Partial<WorkspaceState> {
  const model = resolveDatasetModel({
    sourceDataset: snapshot.dataset,
    modelKind: snapshot.modelKind,
    inputColumn: snapshot.inputColumn,
    targetColumn: snapshot.targetColumn,
    customSourceText: snapshot.perExampleLossSourceText,
    customParameterNames: snapshot.datasetPrimaryVariableNames,
  });

  return {
    mode: snapshot.mode,
    primaryVariables,
    datasetPrimaryVariableNames: snapshot.datasetPrimaryVariableNames,
    modelKind: snapshot.modelKind,
    inputColumn: snapshot.inputColumn,
    targetColumn: snapshot.targetColumn,
    sourceDataset: snapshot.dataset,
    dataset: model.dataset,
    datasetFileName: snapshot.datasetFileName,
    datasetError: null,
    datasetWarning: null,
    modelDataError: model.dataError,
    perExampleLossSourceText: snapshot.perExampleLossSourceText,
    perExampleLossErrors: model.formulaErrors,
    activePerExampleLoss: model.compiled,
    modelDefinesPrediction: model.definesPrediction,
    focusedRuleId: null,
    parameterHover: null,
    datasetInitialValues: snapshot.datasetInitialValues,
    batchSize: snapshot.batchSize,
    datasetRunTargetKind: snapshot.datasetRunTargetKind,
    datasetRunTargetValue: snapshot.datasetRunTargetValue,
  };
}

export const createPersistenceSlice: StateCreator<WorkspaceState, [], [], PersistenceSlice> = (set, get) => ({
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
      modelKind: state.modelKind,
      inputColumn: state.inputColumn,
      targetColumn: state.targetColumn,
      dataset: state.sourceDataset,
      datasetFileName: state.datasetFileName,
      perExampleLossSourceText: state.perExampleLossSourceText,
      datasetInitialValues: state.datasetInitialValues,
      batchSize: state.batchSize,
      datasetRunTargetKind: state.datasetRunTargetKind,
      datasetRunTargetValue: state.datasetRunTargetValue,
      simLimits: state.simLimits,
      stepsPerSecond: state.stepsPerSecond,
      surfaceBounds: state.surfaceBounds,
    };
  },

  loadWorkspaceSnapshot: (value) => {
    const { snapshot, errors } = validateWorkspaceSnapshot(value);
    if (!snapshot) return { errors };

    const primaryVariables = primaryVariablesFor(snapshot.mode, snapshot.modelKind, snapshot.datasetPrimaryVariableNames);

    // One atomic update, so no render ever sees a half-loaded workspace.
    set({
      ...lossStateFromSnapshot(snapshot),
      ...datasetStateFromSnapshot(snapshot, primaryVariables),
      rules: rulesFromSnapshot(snapshot, primaryVariables),
      startPoint: snapshot.startPoint,
      cameraMode: snapshot.cameraMode,
      seed: snapshot.seed,
      noiseLevel: snapshot.noiseLevel,
      simLimits: snapshot.simLimits,
      stepsPerSecond: snapshot.stepsPerSecond,
      surfaceBounds: snapshot.surfaceBounds,
    });

    return { errors: [] };
  },
});
