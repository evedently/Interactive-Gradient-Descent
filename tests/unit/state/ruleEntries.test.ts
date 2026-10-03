import { describe, expect, it } from "vitest";
import { SURFACE_PRIMARY_VARIABLES } from "../../../src/domain/rules/ruleCompiler";
import { makeRule, MOMENTUM_RULE_SOURCE, translateRulesForPrimaryVariables } from "../../../src/state/ruleEntries";

const WB = [{ name: "w" }, { name: "b" }];

describe("translateRulesForPrimaryVariables", () => {
  it("translateRules_momentum_keepsTheRuleRenamedAndCompiled", () => {
    const rule = makeRule("Momentum", "#fff", MOMENTUM_RULE_SOURCE, SURFACE_PRIMARY_VARIABLES);
    const [translated] = translateRulesForPrimaryVariables([rule], SURFACE_PRIMARY_VARIABLES, WB);
    expect(translated.sourceText).toContain("w_next = w + vx_next");
    expect(translated.sourceText).toContain("parameter beta");
    expect(translated.errors).toEqual([]);
    expect(translated.activeCompiledRule.parameters.map((p) => p.name)).toEqual(["eta", "beta"]);
  });

  it("translateRules_keepsNameColorAndIdentity", () => {
    const rule = makeRule("Mine", "#123456", MOMENTUM_RULE_SOURCE, SURFACE_PRIMARY_VARIABLES);
    const [translated] = translateRulesForPrimaryVariables([rule], SURFACE_PRIMARY_VARIABLES, WB);
    expect(translated).toMatchObject({ id: rule.id, name: "Mine", color: "#123456" });
  });

  it("translateRules_roundTrip_restoresOriginalText", () => {
    const rule = makeRule("Momentum", "#fff", MOMENTUM_RULE_SOURCE, SURFACE_PRIMARY_VARIABLES);
    const there = translateRulesForPrimaryVariables([rule], SURFACE_PRIMARY_VARIABLES, WB);
    const [back] = translateRulesForPrimaryVariables(there, WB, SURFACE_PRIMARY_VARIABLES);
    expect(back.sourceText).toBe(MOMENTUM_RULE_SOURCE);
    expect(back.errors).toEqual([]);
  });

  it("translateRules_nameCollision_keepsOriginalTextWithErrorsAndRunsDefault", () => {
    const source = "parameter w = 0.1 range 0 to 1\nx_next = x - w * gx\ny_next = y - w * gy";
    const rule = makeRule("Clash", "#fff", source, SURFACE_PRIMARY_VARIABLES);
    const [translated] = translateRulesForPrimaryVariables([rule], SURFACE_PRIMARY_VARIABLES, WB);
    expect(translated.sourceText).toBe(source);
    expect(translated.errors.length).toBeGreaterThan(0);
    // Still runnable: falls back to the default rule for the new variables until the text is fixed.
    expect(translated.activeCompiledRule).toBeDefined();
  });

  it("translateRules_ruleWithEditErrors_translatesItsTextAnyway", () => {
    const rule = { ...makeRule("Half", "#fff", MOMENTUM_RULE_SOURCE, SURFACE_PRIMARY_VARIABLES), sourceText: "x_next = x - 0.1 * gx\ny_next =" };
    const [translated] = translateRulesForPrimaryVariables([rule], SURFACE_PRIMARY_VARIABLES, WB);
    expect(translated.sourceText).toBe("w_next = w - 0.1 * gw\nb_next =");
    expect(translated.errors.length).toBeGreaterThan(0);
  });
});
