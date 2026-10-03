import type { StateCreator } from "zustand";
import { parseLossFunction, parseManualGradientComponent } from "../../domain/lossFunction";
import { baseLossFrom, DEFAULT_LOSS_SOURCE, INITIAL_ACTIVE_LOSS, INITIAL_LOSS_PARSE, recomputeActiveLoss } from "../resolvedLoss";
import type { LossSlice, WorkspaceState } from "../workspaceState";

export const createLossSlice: StateCreator<WorkspaceState, [], [], LossSlice> = (set) => ({
  lossSourceText: DEFAULT_LOSS_SOURCE,
  lossParse: INITIAL_LOSS_PARSE,
  activeLoss: INITIAL_ACTIVE_LOSS,

  manualGradientEnabled: false,
  manualGradientGxSource: "",
  manualGradientGySource: "",
  manualGradientGxError: null,
  manualGradientGyError: null,
  manualGradientGxAst: null,
  manualGradientGyAst: null,

  setLossSourceText: (text) =>
    set((state) => {
      const parsed = parseLossFunction(text);
      if (!parsed.ok) return { lossSourceText: text, lossParse: parsed };
      return {
        lossSourceText: text,
        lossParse: parsed,
        activeLoss: recomputeActiveLoss(baseLossFrom(parsed), state.manualGradientEnabled, state.manualGradientGxAst, state.manualGradientGyAst),
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
});
