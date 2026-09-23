import { describe, expect, it } from "vitest";
import { parseRuleSource } from "../../../../src/domain/rules/ruleParser";

describe("parseRuleSource", () => {
  it("parses a multi-line assignment program", () => {
    const { program, errors } = parseRuleSource("step_x = eta * gx\nx_next = x - step_x\ny_next = y - eta * gy");
    expect(errors).toEqual([]);
    expect(program?.statements.map((s) => s.name)).toEqual(["step_x", "x_next", "y_next"]);
  });

  it("skips blank lines", () => {
    const { program, errors } = parseRuleSource("x_next = x - 0.1 * gx\n\ny_next = y - 0.1 * gy\n");
    expect(errors).toEqual([]);
    expect(program?.statements).toHaveLength(2);
  });

  it("reports a line that isn't 'name = expression'", () => {
    const { program, errors } = parseRuleSource("x_next = x - gx\nnot an assignment\ny_next = y - gy");
    expect(program).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Expected 'name = expression'/);
  });

  it("locates a syntax error inside an expression at its absolute offset in the full source", () => {
    const source = "x_next = x - \ny_next = y - gy";
    const { program, errors } = parseRuleSource(source);
    expect(program).toBeNull();
    expect(errors).toHaveLength(1);
    // "x - " ends at end of line 1; the error should point within line 1, not line 2.
    expect(errors[0].span.start).toBeLessThan(source.indexOf("y_next"));
  });

  it("collects errors from multiple bad lines, not just the first", () => {
    const { errors } = parseRuleSource("a = )\nb = (\nx_next = x\ny_next = y");
    expect(errors.length).toBe(2);
  });
});

describe("parseRuleSource: parameter declarations", () => {
  it("parses a parameter declaration with no modifiers", () => {
    const { program, errors } = parseRuleSource("parameter eta = 0.01 range 0.0001 to 1\nx_next = x\ny_next = y");
    expect(errors).toEqual([]);
    const decl = program?.statements[0];
    expect(decl).toMatchObject({ kind: "parameter", name: "eta", defaultValue: 0.01, min: 0.0001, max: 1, log: false });
  });

  it("parses step and log modifiers", () => {
    const { program, errors } = parseRuleSource(
      "parameter beta = 0.9 range 0.001 to 0.999 step 0.001 log\nx_next = x\ny_next = y",
    );
    expect(errors).toEqual([]);
    expect(program?.statements[0]).toMatchObject({ kind: "parameter", name: "beta", step: 0.001, log: true });
  });

  it("reports a malformed parameter line with a specific expected-format message", () => {
    const { program, errors } = parseRuleSource("parameter eta = 0.01\nx_next = x\ny_next = y");
    expect(program).toBeNull();
    expect(errors[0].message).toMatch(/Expected 'parameter <name> = <default> range <min> to <max>'/);
  });

  it("reports a non-numeric default value", () => {
    const { program, errors } = parseRuleSource("parameter eta = abc range 0 to 1\nx_next = x\ny_next = y");
    expect(program).toBeNull();
    expect(errors[0].message).toMatch(/Invalid default value 'abc'/);
  });

  it("rejects a default value outside its own declared range", () => {
    const { program, errors } = parseRuleSource("parameter eta = 5 range 0 to 1\nx_next = x\ny_next = y");
    expect(program).toBeNull();
    expect(errors[0].message).toMatch(/must be within its range \[0, 1\]/);
  });

  it("rejects a range whose minimum is not less than its maximum", () => {
    const { program, errors } = parseRuleSource("parameter eta = 0.5 range 1 to 1\nx_next = x\ny_next = y");
    expect(program).toBeNull();
    expect(errors[0].message).toMatch(/minimum \(1\) must be less than its maximum \(1\)/);
  });

  it("rejects a log-scale parameter whose range minimum is not positive", () => {
    const { program, errors } = parseRuleSource("parameter eta = 0.1 range 0 to 1 log\nx_next = x\ny_next = y");
    expect(program).toBeNull();
    expect(errors[0].message).toMatch(/requires a positive range minimum/);
  });

  it("accepts a log-scale parameter with a positive range minimum", () => {
    const { program, errors } = parseRuleSource("parameter eta = 0.01 range 0.0001 to 1 log\nx_next = x\ny_next = y");
    expect(errors).toEqual([]);
    expect(program?.statements[0]).toMatchObject({ kind: "parameter", log: true });
  });
});

describe("parseRuleSource: state declarations", () => {
  it("parses a state declaration", () => {
    const { program, errors } = parseRuleSource("state vx = 0\nx_next = x\ny_next = y");
    expect(errors).toEqual([]);
    expect(program?.statements[0]).toMatchObject({ kind: "state", name: "vx" });
  });

  it("parses a state initializer that is itself an expression", () => {
    const { program, errors } = parseRuleSource(
      "parameter start = 2 range 0 to 10\nstate t = start * 2\nx_next = x\ny_next = y",
    );
    expect(errors).toEqual([]);
    expect(program?.statements[1]).toMatchObject({ kind: "state", name: "t" });
  });

  it("reports a malformed state line", () => {
    const { program, errors } = parseRuleSource("state = 0\nx_next = x\ny_next = y");
    expect(program).toBeNull();
    expect(errors[0].message).toMatch(/Expected 'state <name> = <expression>'/);
  });
});
