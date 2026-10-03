import { create } from "zustand";
import { createDatasetSlice } from "./slices/datasetSlice";
import { createLossSlice } from "./slices/lossSlice";
import { createPersistenceSlice } from "./slices/persistenceSlice";
import { createRulesSlice } from "./slices/rulesSlice";
import { createSettingsSlice } from "./slices/settingsSlice";
import type { WorkspaceState } from "./workspaceState";

export { DEFAULT_LOSS_SOURCE } from "./resolvedLoss";
export { RULE_COLOR_PALETTE, type RuleWorkspaceEntry } from "./ruleEntries";
export { DEFAULT_DATASET_PRIMARY_VARIABLE_NAMES } from "./slices/datasetSlice";
export { DEFAULT_SEED, DEFAULT_STEPS_PER_SECOND } from "./slices/settingsSlice";
export type { CameraMode, DatasetRunTargetKind, WorkspaceMode, WorkspaceState } from "./workspaceState";

/**
 * The single workspace store, composed from one slice per concern (see
 * `workspaceState.ts` for each slice's shape): the shared loss function,
 * the rule list, workspace-wide settings, dataset mode, and save/load.
 */
export const useWorkspaceStore = create<WorkspaceState>()((...args) => ({
  ...createLossSlice(...args),
  ...createRulesSlice(...args),
  ...createSettingsSlice(...args),
  ...createDatasetSlice(...args),
  ...createPersistenceSlice(...args),
}));
