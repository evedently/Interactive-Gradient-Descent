import { compileRule, type CompiledRule, type PrimaryVariable } from "../domain/rules/ruleCompiler";
import { parseRuleSource } from "../domain/rules/ruleParser";
import { renamePrimaryVariables } from "../domain/rules/renamePrimaryVariables";
import type { RuleError } from "../domain/rules/ruleTypes";

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

/**
 * The spec's own worked momentum example — exercises parameters, state, and
 * the persistent-recurrence mechanism (DESIGN.md §4, Phase 2). `eta` is
 * declared `log`-scale since a learning rate spanning four orders of
 * magnitude (0.0001–1) is the canonical case a log slider is for (Phase 3).
 */
export const MOMENTUM_RULE_SOURCE = [
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

export const PLAIN_GRADIENT_DESCENT_SOURCE = [
  "parameter eta = 0.1 range 0.0001 to 1 log",
  "x_next = x - eta * gx",
  "y_next = y - eta * gy",
].join("\n");

/** Cycled through when a new rule is added (DESIGN.md §12: "different editable colors for each trajectory"). */
export const RULE_COLOR_PALETTE = ["#ff6b35", "#4c9aff", "#7ee0a3", "#e0d17e", "#c792ea", "#5fd0e8"];

export function compileRuleSource(source: string, primaryVariables: readonly PrimaryVariable[]): { errors: RuleError[]; compiled: CompiledRule | null } {
  const { program, errors: parseErrors } = parseRuleSource(source);
  if (!program) return { errors: parseErrors, compiled: null };
  return compileRule(program, primaryVariables);
}

export function mustCompile(source: string, primaryVariables: readonly PrimaryVariable[]): CompiledRule {
  const { compiled } = compileRuleSource(source, primaryVariables);
  if (!compiled) throw new Error(`Default rule source failed to compile: ${source}`);
  return compiled;
}

export function makeRuleId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rule-${Math.random().toString(36).slice(2)}`;
}

export function makeRule(name: string, color: string, sourceText: string, primaryVariables: readonly PrimaryVariable[]): RuleWorkspaceEntry {
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

let nextPaletteIndex = 0;
export function nextPaletteColor(): string {
  const color = RULE_COLOR_PALETTE[nextPaletteIndex % RULE_COLOR_PALETTE.length];
  nextPaletteIndex += 1;
  return color;
}

/** A plain, always-compilable gradient-descent template for an arbitrary pair of primary variables (DESIGN.md §4/§7) — used for new rules in dataset mode, and as the fallback a rule runs when its own text doesn't compile. */
export function defaultRuleSourceFor(primaryVariables: readonly PrimaryVariable[]): string {
  const [a, b] = primaryVariables;
  return [
    "parameter eta = 0.1 range 0.0001 to 1 log",
    `${a.name}_next = ${a.name} - eta * g${a.name}`,
    `${b.name}_next = ${b.name} - eta * g${b.name}`,
  ].join("\n");
}

/**
 * Carries every rule over to new primary variables (switching surface <->
 * dataset mode, changing the model, or renaming custom parameters) by
 * renaming what each rule derives from them — `x` -> `w`, `gx` -> `gw`,
 * `x_next` -> `w_next` — so presets and hand-written rules survive the
 * switch instead of being reset to plain gradient descent.
 *
 * If a rule can't be renamed safely (it already uses one of the new names)
 * or the result doesn't compile, its text is kept as-is with its errors
 * shown, and it runs the always-valid default rule for the new variables
 * until fixed — the same fallback loading a saved workspace uses.
 */
export function translateRulesForPrimaryVariables(
  rules: RuleWorkspaceEntry[],
  from: readonly PrimaryVariable[],
  to: readonly PrimaryVariable[],
): RuleWorkspaceEntry[] {
  return rules.map((rule) => {
    const sourceText = renamePrimaryVariables(rule.sourceText, from, to) ?? rule.sourceText;
    const { errors, compiled } = compileRuleSource(sourceText, to);
    return { ...rule, sourceText, errors, activeCompiledRule: compiled ?? mustCompile(defaultRuleSourceFor(to), to) };
  });
}

/** Applies `update` to the rule with `id`, leaving every other rule (and its identity) untouched. */
export function updateRule(rules: RuleWorkspaceEntry[], id: string, update: (rule: RuleWorkspaceEntry) => RuleWorkspaceEntry): RuleWorkspaceEntry[] {
  return rules.map((r) => (r.id === id ? update(r) : r));
}
