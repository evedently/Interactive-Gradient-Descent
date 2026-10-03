import { describe, expect, it } from "vitest";
import { renamePrimaryVariables } from "../../../../src/domain/rules/renamePrimaryVariables";

const XY = [{ name: "x" }, { name: "y" }];
const WB = [{ name: "w" }, { name: "b" }];

const MOMENTUM = [
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

describe("renamePrimaryVariables", () => {
  it("renamePrimaryVariables_momentum_renamesVariablesGradientsAndNextNames", () => {
    const renamed = renamePrimaryVariables(MOMENTUM, XY, WB)!;
    expect(renamed).toContain("vx_next = beta * vx - eta * gw");
    expect(renamed).toContain("vy_next = beta * vy - eta * gb");
    expect(renamed).toContain("w_next = w + vx_next");
    expect(renamed).toContain("b_next = b + vy_next");
  });

  it("renamePrimaryVariables_otherIdentifiers_untouched", () => {
    const renamed = renamePrimaryVariables(MOMENTUM, XY, WB)!;
    expect(renamed).toContain("state vx = 0");
    expect(renamed).toContain("parameter beta = 0.9");
    expect(renamed).toContain("0.0001 to 1 log");
  });

  it("renamePrimaryVariables_scientificNotation_notMistakenForIdentifiers", () => {
    expect(renamePrimaryVariables("x_next = x - 1e-3 * gx\ny_next = y", XY, [{ name: "e" }, { name: "b" }])).toBe(
      "e_next = e - 1e-3 * ge\nb_next = b",
    );
  });

  it("renamePrimaryVariables_functionsAndLongerNames_untouched", () => {
    expect(renamePrimaryVariables("x_next = exp(x) + xy + max_x\ny_next = y", XY, WB)).toBe("w_next = exp(w) + xy + max_x\nb_next = b");
  });

  it("renamePrimaryVariables_roundTrip_restoresOriginal", () => {
    expect(renamePrimaryVariables(renamePrimaryVariables(MOMENTUM, XY, WB)!, WB, XY)).toBe(MOMENTUM);
  });

  it("renamePrimaryVariables_swappedNames_renamesSimultaneously", () => {
    expect(renamePrimaryVariables("x_next = y\ny_next = x", XY, [{ name: "y" }, { name: "x" }])).toBe("y_next = x\nx_next = y");
  });

  it("renamePrimaryVariables_ruleAlreadyUsesATargetName_null", () => {
    // `w` is already this rule's own parameter: renaming x -> w would merge two different variables.
    expect(renamePrimaryVariables("parameter w = 0.1\nx_next = x - w * gx\ny_next = y - w * gy", XY, WB)).toBeNull();
  });

  it("renamePrimaryVariables_sameNames_unchanged", () => {
    expect(renamePrimaryVariables(MOMENTUM, XY, XY)).toBe(MOMENTUM);
  });
});
