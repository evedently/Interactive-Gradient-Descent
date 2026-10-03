import type { StateCreator } from "zustand";
import { SURFACE_PRIMARY_VARIABLES } from "../../domain/rules/ruleCompiler";
import { clamp } from "../../lib/math";
import {
  compileRuleSource,
  defaultRuleSourceFor,
  makeRule,
  MOMENTUM_RULE_SOURCE,
  nextPaletteColor,
  PLAIN_GRADIENT_DESCENT_SOURCE,
  updateRule,
} from "../ruleEntries";
import type { RulesSlice, WorkspaceState } from "../workspaceState";

export const createRulesSlice: StateCreator<WorkspaceState, [], [], RulesSlice> = (set) => ({
  rules: [
    makeRule("Momentum", nextPaletteColor(), MOMENTUM_RULE_SOURCE, SURFACE_PRIMARY_VARIABLES),
    makeRule("Gradient Descent", nextPaletteColor(), PLAIN_GRADIENT_DESCENT_SOURCE, SURFACE_PRIMARY_VARIABLES),
  ],

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
      rules: updateRule(state.rules, id, (r) => {
        const { errors, compiled } = compileRuleSource(text, state.primaryVariables);
        return { ...r, sourceText: text, errors, activeCompiledRule: compiled ?? r.activeCompiledRule };
      }),
    })),

  setRuleName: (id, name) => set((state) => ({ rules: updateRule(state.rules, id, (r) => ({ ...r, name })) })),

  setRuleColor: (id, color) => set((state) => ({ rules: updateRule(state.rules, id, (r) => ({ ...r, color })) })),

  setRuleVisible: (id, visible) => set((state) => ({ rules: updateRule(state.rules, id, (r) => ({ ...r, visible })) })),

  setRuleCollapsed: (id, collapsed) => set((state) => ({ rules: updateRule(state.rules, id, (r) => ({ ...r, collapsed })) })),

  moveRule: (id, toIndex) =>
    set((state) => {
      const fromIndex = state.rules.findIndex((r) => r.id === id);
      if (fromIndex === -1) return {};
      const rules = [...state.rules];
      const [moved] = rules.splice(fromIndex, 1);
      rules.splice(clamp(toIndex, 0, rules.length), 0, moved);
      return { rules };
    }),
});
