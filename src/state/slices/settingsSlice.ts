import type { StateCreator } from "zustand";
import { DEFAULT_SIM_LIMITS } from "../../domain/simulation/types";
import { DEFAULT_SURFACE_BOUNDS } from "../../domain/visualization/surfaceGeometry";
import type { SettingsSlice, WorkspaceState } from "../workspaceState";

export const DEFAULT_SEED = 42;
/** Matches the fixed rate every rule stepped at before this became a presenter-facing global control. */
export const DEFAULT_STEPS_PER_SECOND = 4;
const MIN_STEPS_PER_SECOND = 0.1;

export const createSettingsSlice: StateCreator<WorkspaceState, [], [], SettingsSlice> = (set) => ({
  startPoint: { x: 0, y: 0 },
  cameraMode: "rotate",
  secondaryPanelCollapsed: false,
  surfaceBounds: DEFAULT_SURFACE_BOUNDS,
  seed: DEFAULT_SEED,
  noiseLevel: 0,
  simLimits: DEFAULT_SIM_LIMITS,
  stepsPerSecond: DEFAULT_STEPS_PER_SECOND,

  setStartPoint: (point) => set({ startPoint: point }),
  setCameraMode: (mode) => set({ cameraMode: mode }),
  setSecondaryPanelCollapsed: (collapsed) => set({ secondaryPanelCollapsed: collapsed }),
  setSurfaceBounds: (bounds) => set({ surfaceBounds: bounds }),
  setSeed: (seed) => set({ seed }),
  setNoiseLevel: (level) => set({ noiseLevel: level }),
  setSimLimits: (partial) => set((state) => ({ simLimits: { ...state.simLimits, ...partial } })),
  setStepsPerSecond: (stepsPerSecond) => set({ stepsPerSecond: Math.max(MIN_STEPS_PER_SECOND, stepsPerSecond) }),
});
