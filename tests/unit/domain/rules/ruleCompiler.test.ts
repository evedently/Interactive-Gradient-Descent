import { describe, expect, it } from "vitest";
import { parseRuleSource } from "../../../../src/domain/rules/ruleParser";
import { compileRule } from "../../../../src/domain/rules/ruleCompiler";

function compile(source: string) {
  const { program, errors: parseErrors } = parseRuleSource(source);
  if (!program) throw new Error(`fixture source failed to parse: ${JSON.stringify(parseErrors)}`);
  return compileRule(program);
}

describe("compileRule: valid programs (assignment-only)", () => {
  it("compiles plain gradient descent", () => {
    const { compiled, errors } = compile("x_next = x - 0.1 * gx\ny_next = y - 0.1 * gy");
    expect(errors).toEqual([]);
    expect(compiled?.bodyStatements.map((s) => s.name)).toEqual(["x_next", "y_next"]);
    expect(compiled?.parameters).toEqual([]);
    expect(compiled?.stateDecls).toEqual([]);
  });

  it("allows intermediate variables computed before x_next/y_next", () => {
    const { compiled, errors } = compile("step_x = 0.1 * gx\nstep_y = 0.1 * gy\nx_next = x - step_x\ny_next = y - step_y");
    expect(errors).toEqual([]);
    expect(compiled?.bodyStatements).toHaveLength(4);
  });

  it("allows referencing reserved inputs (x, y, gx, gy, loss, iteration, elapsed_time)", () => {
    const { errors } = compile("x_next = x - 0.1 * gx + 0 * loss + 0 * iteration + 0 * elapsed_time\ny_next = y - 0.1 * gy");
    expect(errors).toEqual([]);
  });
});

describe("compileRule: undefined variables", () => {
  it("rejects a reference to a name not yet defined", () => {
    const { compiled, errors } = compile("x_next = x - step_x\ny_next = y - gy");
    expect(compiled).toBeNull();
    expect(errors.some((e) => /Undefined variable 'step_x'/.test(e.message))).toBe(true);
  });

  it("rejects forward references (sequential evaluation only, no reordering)", () => {
    const { compiled, errors } = compile("x_next = x - step_x\nstep_x = 0.1 * gx\ny_next = y - gy");
    expect(compiled).toBeNull();
    expect(errors.some((e) => /Undefined variable 'step_x'/.test(e.message))).toBe(true);
  });

  it("rejects self-reference in a variable's own defining statement with a distinct message", () => {
    const { compiled, errors } = compile("a = a + 1\nx_next = x - a\ny_next = y");
    expect(compiled).toBeNull();
    expect(errors.some((e) => /'a' cannot reference itself in its own defining statement/.test(e.message))).toBe(true);
  });
});

describe("compileRule: reserved inputs are read-only", () => {
  it("rejects assigning to a reserved simulation input", () => {
    const { compiled, errors } = compile("x = x + 1\nx_next = x\ny_next = y");
    expect(compiled).toBeNull();
    expect(errors.some((e) => /'x' is a read-only simulation input/.test(e.message))).toBe(true);
  });

  it("rejects assigning to gx", () => {
    const { compiled, errors } = compile("gx = 0\nx_next = x - gx\ny_next = y - gy");
    expect(compiled).toBeNull();
    expect(errors.some((e) => /'gx' is a read-only simulation input/.test(e.message))).toBe(true);
  });
});

describe("compileRule: required position outputs", () => {
  it("rejects a rule that never assigns x_next", () => {
    const { compiled, errors } = compile("y_next = y - gy");
    expect(compiled).toBeNull();
    expect(errors.some((e) => /must assign 'x_next'/.test(e.message))).toBe(true);
  });

  it("rejects a rule that never assigns y_next", () => {
    const { compiled, errors } = compile("x_next = x - gx");
    expect(compiled).toBeNull();
    expect(errors.some((e) => /must assign 'y_next'/.test(e.message))).toBe(true);
  });

  it("rejects an empty program", () => {
    const { program } = parseRuleSource("");
    const { compiled, errors } = compileRule(program!);
    expect(compiled).toBeNull();
    expect(errors).toHaveLength(2);
  });
});

describe("compileRule: parameter declarations", () => {
  it("compiles a parameter and makes it usable in the body", () => {
    const { compiled, errors } = compile(
      "parameter eta = 0.1 range 0.0001 to 1\nx_next = x - eta * gx\ny_next = y - eta * gy",
    );
    expect(errors).toEqual([]);
    expect(compiled?.parameters).toEqual([{ name: "eta", defaultValue: 0.1, min: 0.0001, max: 1, step: undefined, log: false }]);
  });

  it("parses optional step and log modifiers in either order", () => {
    const a = compile("parameter eta = 0.01 range 0.0001 to 1 step 0.0001 log\nx_next = x\ny_next = y");
    expect(a.errors).toEqual([]);
    expect(a.compiled?.parameters[0]).toEqual({ name: "eta", defaultValue: 0.01, min: 0.0001, max: 1, step: 0.0001, log: true });

    const b = compile("parameter eta = 0.01 range 0.0001 to 1 log step 0.0001\nx_next = x\ny_next = y");
    expect(b.errors).toEqual([]);
    expect(b.compiled?.parameters[0]).toEqual({ name: "eta", defaultValue: 0.01, min: 0.0001, max: 1, step: 0.0001, log: true });
  });

  it("rejects declaring the same parameter name twice", () => {
    const { compiled, errors } = compile(
      "parameter eta = 0.1 range 0 to 1\nparameter eta = 0.2 range 0 to 1\nx_next = x\ny_next = y",
    );
    expect(compiled).toBeNull();
    expect(errors.some((e) => /'eta' is already declared/.test(e.message))).toBe(true);
  });

  it("rejects a parameter named after a reserved input", () => {
    const { compiled, errors } = compile("parameter gx = 0.1 range 0 to 1\nx_next = x\ny_next = y");
    expect(compiled).toBeNull();
    expect(errors.some((e) => /'gx' is a read-only simulation input/.test(e.message))).toBe(true);
  });
});

describe("compileRule: state declarations and persistent recurrence", () => {
  it("compiles the spec's momentum example end to end", () => {
    const source = [
      "parameter eta = 0.01 range 0.0001 to 1",
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
    const { compiled, errors } = compile(source);
    expect(errors).toEqual([]);
    expect(compiled?.stateDecls.map((s) => s.name)).toEqual(["vx", "vy"]);
    expect(compiled?.parameters.map((p) => p.name)).toEqual(["eta", "beta"]);
  });

  it("allows an arbitrary number of user-named state variables, not just vx/vy", () => {
    const source = [
      "state moment1 = 0",
      "state moment2 = 0",
      "state accumulated_gradient = 0",
      "moment1 = moment1 + gx",
      "moment2 = moment2 + gx * gx",
      "accumulated_gradient = accumulated_gradient + gx",
      "x_next = x - 0.01 * moment1",
      "y_next = y - 0.01 * moment2",
    ].join("\n");
    const { compiled, errors } = compile(source);
    expect(errors).toEqual([]);
    expect(compiled?.stateDecls.map((s) => s.name)).toEqual(["moment1", "moment2", "accumulated_gradient"]);
  });

  it("allows a state initializer to reference an earlier parameter", () => {
    const { compiled, errors } = compile(
      "parameter start = 2 range 0 to 10\nstate t = start\nt_next = t^2\nt = t_next\nx_next = x\ny_next = y",
    );
    expect(errors).toEqual([]);
    expect(compiled?.stateDecls[0]).toEqual({ name: "t", initExpr: expect.anything() });
  });

  it("allows a state initializer to reference an earlier state declaration", () => {
    const { compiled, errors } = compile(
      "state a = 1\nstate b = a + 1\nx_next = x - a - b\ny_next = y",
    );
    expect(errors).toEqual([]);
    expect(compiled?.stateDecls.map((s) => s.name)).toEqual(["a", "b"]);
  });

  it("rejects a state initializer referencing a reserved input", () => {
    const { compiled, errors } = compile("state t = x\nt_next = t\nx_next = x\ny_next = y");
    expect(compiled).toBeNull();
    expect(errors.some((e) => /only reference parameters and earlier state declarations/.test(e.message))).toBe(true);
  });

  it("rejects a state initializer referencing a later state declaration (no forward references)", () => {
    const { compiled, errors } = compile("state a = b\nstate b = 1\nx_next = x\ny_next = y");
    expect(compiled).toBeNull();
    expect(errors.some((e) => /only reference parameters and earlier state declarations/.test(e.message))).toBe(true);
  });

  it("rejects a state initializer that references itself", () => {
    const { compiled, errors } = compile("state t = t + 1\nx_next = x\ny_next = y");
    expect(compiled).toBeNull();
    expect(errors.some((e) => /'t' cannot reference itself in its own initializer/.test(e.message))).toBe(true);
  });

  it("rejects a state variable named after a reserved input", () => {
    const { compiled, errors } = compile("state loss = 0\nx_next = x\ny_next = y");
    expect(compiled).toBeNull();
    expect(errors.some((e) => /'loss' is a read-only simulation input/.test(e.message))).toBe(true);
  });

  it("rejects declaring a state variable with a name already used by a parameter", () => {
    const { compiled, errors } = compile("parameter eta = 0.1 range 0 to 1\nstate eta = 0\nx_next = x\ny_next = y");
    expect(compiled).toBeNull();
    expect(errors.some((e) => /'eta' is already declared/.test(e.message))).toBe(true);
  });
});

describe("compileRule: generalized primary variables (DESIGN.md §4/§7, Phase 7)", () => {
  function compileWith(source: string, primaryVariables: { name: string }[]) {
    const { program, errors: parseErrors } = parseRuleSource(source);
    if (!program) throw new Error(`fixture source failed to parse: ${JSON.stringify(parseErrors)}`);
    return compileRule(program, primaryVariables);
  }

  it("compiles a rule against presenter-named model parameters instead of x/y", () => {
    const { compiled, errors } = compileWith(
      "weight_next = weight - 0.1 * gweight\nbias_next = bias - 0.1 * gbias",
      [{ name: "weight" }, { name: "bias" }],
    );
    expect(errors).toEqual([]);
    expect(compiled?.bodyStatements.map((s) => s.name)).toEqual(["weight_next", "bias_next"]);
  });

  it("requires the presenter-named next-position outputs, not x_next/y_next", () => {
    const { compiled, errors } = compileWith("x_next = x - 0.1 * gx\ny_next = y - 0.1 * gy", [
      { name: "weight" },
      { name: "bias" },
    ]);
    expect(compiled).toBeNull();
    expect(errors.some((e) => /'weight_next'/.test(e.message))).toBe(true);
    expect(errors.some((e) => /'bias_next'/.test(e.message))).toBe(true);
  });

  it("rejects declaring a parameter or state variable named after a primary variable's reserved gradient input", () => {
    const { compiled, errors } = compileWith(
      "state gweight = 0\nweight_next = weight\nbias_next = bias",
      [{ name: "weight" }, { name: "bias" }],
    );
    expect(compiled).toBeNull();
    expect(errors.some((e) => /'gweight' is a read-only simulation input/.test(e.message))).toBe(true);
  });

  it("omitting primaryVariables reproduces the surface-mode x/y behavior exactly", () => {
    const { compiled: withDefault } = compile("x_next = x - 0.1 * gx\ny_next = y - 0.1 * gy");
    const { compiled: withExplicitXY } = compileWith("x_next = x - 0.1 * gx\ny_next = y - 0.1 * gy", [
      { name: "x" },
      { name: "y" },
    ]);
    expect(withDefault).toEqual(withExplicitXY);
  });
});
