import type { PrimaryVariable } from "./ruleCompiler";

/** An identifier not glued to a preceding letter, digit, `_` or `.` — so the `e5` in `1e5` or the `x` in `max_x` never match. */
const IDENTIFIER = /(?<![A-Za-z0-9_.])[A-Za-z_][A-Za-z0-9_]*/g;

/** Every name a rule derives from one primary variable `v`: `v` itself, its gradient `gv`, and its update target `v_next`. */
function derivedNames(name: string): string[] {
  return [name, `g${name}`, `${name}_next`];
}

/**
 * Rewrites a rule written for primary variables `from` so it works for
 * `to` (matched by position): `x` → `w`, `gx` → `gw`, `x_next` → `w_next`,
 * all renamed at once, so swapping two names works too. Every other
 * identifier — the rule's own parameters and state, function names — is
 * left untouched.
 *
 * Returns `null` when the rule already uses one of the new names for
 * something of its own (e.g. a `parameter w`): renaming would silently
 * merge two different variables.
 */
export function renamePrimaryVariables(source: string, from: readonly PrimaryVariable[], to: readonly PrimaryVariable[]): string | null {
  const mapping = new Map<string, string>();
  from.forEach((v, i) => {
    const fromNames = derivedNames(v.name);
    const toNames = derivedNames(to[i].name);
    fromNames.forEach((name, j) => mapping.set(name, toNames[j]));
  });

  const targets = new Set(mapping.values());
  const used = source.match(IDENTIFIER) ?? [];
  if (used.some((name) => targets.has(name) && !mapping.has(name))) return null;

  return source.replace(IDENTIFIER, (name) => mapping.get(name) ?? name);
}
