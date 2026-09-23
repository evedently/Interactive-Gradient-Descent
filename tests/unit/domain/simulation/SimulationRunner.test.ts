import { describe, expect, it } from "vitest";
import { parseLossFunction, toResolvedLoss } from "../../../../src/domain/lossFunction";
import { parseRuleSource } from "../../../../src/domain/rules/ruleParser";
import { compileRule } from "../../../../src/domain/rules/ruleCompiler";
import { SimulationRunner } from "../../../../src/domain/simulation/SimulationRunner";
import { DEFAULT_SIM_LIMITS, type SimLimits } from "../../../../src/domain/simulation/types";

function makeRunner(
  ruleSource: string,
  start = { x: 0, y: 0 },
  seed = 42,
  noiseLevel = 0,
  simLimits: SimLimits = DEFAULT_SIM_LIMITS,
  lossSource = "(x - 3)^2 + 4*(y + 1)^2",
) {
  const loss = parseLossFunction(lossSource);
  if (!loss.ok) throw new Error("fixture loss function failed to parse");
  const { program, errors: parseErrors } = parseRuleSource(ruleSource);
  if (!program) throw new Error(`fixture rule failed to parse: ${JSON.stringify(parseErrors)}`);
  const { compiled, errors: compileErrors } = compileRule(program);
  if (!compiled) throw new Error(`fixture rule failed to compile: ${JSON.stringify(compileErrors)}`);
  return new SimulationRunner(toResolvedLoss(loss), compiled, start, seed, noiseLevel, simLimits);
}

const GRADIENT_DESCENT = "x_next = x - 0.1 * gx\ny_next = y - 0.1 * gy";

describe("SimulationRunner: acceptance test #1 — one-step gradient descent vs. hand-computed result", () => {
  it("matches a hand-computed step for f(x,y) = (x-3)^2 + 4(y+1)^2 from (0,0), eta=0.1", () => {
    const runner = makeRunner(GRADIENT_DESCENT);
    // Analytic gradient at (0,0): df/dx = 2(x-3) = -6, df/dy = 8(y+1) = 8.
    // x_next = 0 - 0.1*(-6) = 0.6 ; y_next = 0 - 0.1*8 = -0.8.
    const result = runner.step();
    expect(result.errored).toBe(false);
    expect(result.point!.x).toBeCloseTo(0.6, 6);
    expect(result.point!.y).toBeCloseTo(-0.8, 6);
    expect(result.point!.iteration).toBe(1);
  });
});

describe("SimulationRunner: play/pause/reset/step status machine", () => {
  it("starts idle with a single seeded trajectory point", () => {
    const runner = makeRunner(GRADIENT_DESCENT);
    expect(runner.status).toBe("idle");
    expect(runner.trajectory).toHaveLength(1);
    expect(runner.iteration).toBe(0);
  });

  it("step() advances by exactly one iteration regardless of status", () => {
    const runner = makeRunner(GRADIENT_DESCENT);
    runner.step();
    expect(runner.iteration).toBe(1);
    expect(runner.trajectory).toHaveLength(2);
  });

  it("play() transitions to running; pause() only takes effect from running", () => {
    const runner = makeRunner(GRADIENT_DESCENT);
    runner.pause(); // no-op from idle
    expect(runner.status).toBe("idle");
    runner.play();
    expect(runner.status).toBe("running");
    runner.pause();
    expect(runner.status).toBe("paused");
  });

  it("reset() restores iteration 0 and the original starting position", () => {
    const runner = makeRunner(GRADIENT_DESCENT, { x: 5, y: 5 });
    runner.step();
    runner.step();
    expect(runner.iteration).toBe(2);
    runner.reset();
    expect(runner.iteration).toBe(0);
    expect(runner.status).toBe("idle");
    expect(runner.trajectory).toHaveLength(1);
    expect(runner.current.x).toBe(5);
    expect(runner.current.y).toBe(5);
  });

  it("notifies subscribers on step, play, pause, and reset", () => {
    const runner = makeRunner(GRADIENT_DESCENT);
    let notifications = 0;
    const unsubscribe = runner.subscribe(() => notifications++);
    runner.play();
    runner.step();
    runner.pause();
    runner.reset();
    expect(notifications).toBe(4);
    unsubscribe();
  });
});

describe("SimulationRunner: peekUpdate (live preview without committing)", () => {
  it("reports the pending update vector without changing position", () => {
    const runner = makeRunner(GRADIENT_DESCENT);
    const peek = runner.peekUpdate();
    expect(peek.ok).toBe(true);
    if (peek.ok) {
      expect(peek.newX).toBeCloseTo(0.6, 6);
      expect(peek.newY).toBeCloseTo(-0.8, 6);
    }
    // position must be unchanged — peek never commits
    expect(runner.current.x).toBe(0);
    expect(runner.current.y).toBe(0);
    expect(runner.iteration).toBe(0);
  });
});

describe("SimulationRunner: NaN/Infinity guard preserves last valid state", () => {
  it("stops on a non-finite update and keeps the last valid position", () => {
    const runner = makeRunner("x_next = 1 / 0\ny_next = y");
    const before = { x: runner.current.x, y: runner.current.y };
    const result = runner.step();
    expect(result.errored).toBe(true);
    expect(runner.status).toBe("error");
    expect(runner.current.x).toBe(before.x);
    expect(runner.current.y).toBe(before.y);
    expect(runner.iteration).toBe(0);
  });

  it("stays in the error state on further step() calls until reset", () => {
    const runner = makeRunner("x_next = 1 / 0\ny_next = y");
    runner.step();
    const result = runner.step();
    expect(result.errored).toBe(true);
    expect(runner.status).toBe("error");
  });

  it("reset() recovers from the error state", () => {
    const runner = makeRunner("x_next = 1 / 0\ny_next = y");
    runner.step();
    expect(runner.status).toBe("error");
    runner.reset();
    expect(runner.status).toBe("idle");
    expect(runner.lastError).toBeNull();
  });
});

describe("SimulationRunner: convergence over many iterations", () => {
  it("gradient descent with a small learning rate visibly converges toward the minimum (3, -1)", () => {
    const runner = makeRunner(GRADIENT_DESCENT, { x: 0, y: 0 });
    for (let i = 0; i < 200; i++) runner.step();
    expect(runner.status).not.toBe("error");
    expect(runner.current.x).toBeCloseTo(3, 2);
    expect(runner.current.y).toBeCloseTo(-1, 2);
    expect(runner.current.loss).toBeLessThan(1e-3);
  });
});

describe("SimulationRunner: acceptance test #2 — one-step momentum vs. hand-computed result", () => {
  const MOMENTUM = [
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

  it("matches a hand-computed step for the spec's own momentum example", () => {
    const runner = makeRunner(MOMENTUM, { x: 0, y: 0 });
    // gx=-6, gy=8 at (0,0). vx_next = 0.9*0 - 0.01*(-6) = 0.06 ; vy_next = 0.9*0 - 0.01*8 = -0.08.
    const result = runner.step();
    expect(result.errored).toBe(false);
    expect(result.point!.x).toBeCloseTo(0.06, 9);
    expect(result.point!.y).toBeCloseTo(-0.08, 9);
    expect(runner.currentStateValues.vx).toBeCloseTo(0.06, 9);
    expect(runner.currentStateValues.vy).toBeCloseTo(-0.08, 9);
  });
});

describe("SimulationRunner: acceptance test #3 — persistent recurrence across multiple iterations", () => {
  // The exact recurrence from DESIGN.md §4/the user's own worked example:
  // t_0=2, t_1=4, t_2=16, t_3=256 via `state t = 2; t_next = t^2; t = t_next`.
  const T_RECURRENCE = "state t = 2\nt_next = t^2\nt = t_next\nx_next = x\ny_next = y";

  it("produces 2, 4, 16, 256 exactly", () => {
    const runner = makeRunner(T_RECURRENCE, { x: 0, y: 0 });
    expect(runner.currentStateValues.t).toBe(2); // t_0, before any step
    runner.step();
    expect(runner.currentStateValues.t).toBe(4); // t_1
    runner.step();
    expect(runner.currentStateValues.t).toBe(16); // t_2
    runner.step();
    expect(runner.currentStateValues.t).toBe(256); // t_3
  });

  it("reset() restores state to its initializer, alongside position", () => {
    const runner = makeRunner(T_RECURRENCE, { x: 3, y: 3 });
    runner.step();
    runner.step();
    expect(runner.currentStateValues.t).toBe(16);
    runner.reset();
    expect(runner.currentStateValues.t).toBe(2);
    expect(runner.current.x).toBe(3);
    expect(runner.current.y).toBe(3);
  });
});

describe("SimulationRunner: Phase 3 — live parameter editing", () => {
  const PARAMETERIZED_GD = "parameter eta = 0.1 range 0.0001 to 1\nx_next = x - eta * gx\ny_next = y - eta * gy";

  it("uses the declared default value until changed", () => {
    const runner = makeRunner(PARAMETERIZED_GD, { x: 0, y: 0 });
    expect(runner.currentParameterValues.eta).toBe(0.1);
    const peek = runner.peekUpdate();
    expect(peek.ok).toBe(true);
    if (peek.ok) expect(peek.dx).toBeCloseTo(0.6, 9); // 0.1 * -(-6)
  });

  it("changing a parameter affects only future steps — past history is provably unchanged", () => {
    const runner = makeRunner(PARAMETERIZED_GD, { x: 0, y: 0 });
    runner.step(); // with eta=0.1
    runner.step();
    const historyBefore = runner.trajectory.map((p) => ({ ...p }));

    runner.setParameterValue("eta", 0.5);

    // every already-recorded point must be byte-for-byte identical
    expect(runner.trajectory.slice(0, historyBefore.length)).toEqual(historyBefore);

    const peekAfterChange = runner.peekUpdate();
    expect(peekAfterChange.ok).toBe(true);
    // eta changed from 0.1 to 0.5 — the pending update must reflect the NEW value already
    if (peekAfterChange.ok) {
      const expectedDx = 0.5 * -runner.current.gx;
      expect(peekAfterChange.dx).toBeCloseTo(expectedDx, 9);
    }
  });

  it("clamps an out-of-range value to the declared [min, max]", () => {
    const runner = makeRunner(PARAMETERIZED_GD);
    runner.setParameterValue("eta", 999);
    expect(runner.currentParameterValues.eta).toBe(1); // max
    runner.setParameterValue("eta", -5);
    expect(runner.currentParameterValues.eta).toBe(0.0001); // min
  });

  it("resetParameterToDefault restores the declared default independent of the rule-level Reset", () => {
    const runner = makeRunner(PARAMETERIZED_GD, { x: 0, y: 0 });
    runner.setParameterValue("eta", 0.5);
    runner.step();
    expect(runner.iteration).toBe(1); // rule-level state/position untouched by the param change
    runner.resetParameterToDefault("eta");
    expect(runner.currentParameterValues.eta).toBe(0.1);
    expect(runner.iteration).toBe(1); // resetting a parameter does not reset the run
  });

  it("notifies subscribers when a parameter changes", () => {
    const runner = makeRunner(PARAMETERIZED_GD);
    let notifications = 0;
    runner.subscribe(() => notifications++);
    runner.setParameterValue("eta", 0.3);
    expect(notifications).toBe(1);
  });
});

describe("SimulationRunner: divergence safeguards (DESIGN.md §17, Phase 9)", () => {
  it("stops when a primary variable exceeds maxAbsPrimaryVariableValue, preserving last valid state", () => {
    const limits: SimLimits = { ...DEFAULT_SIM_LIMITS, maxAbsPrimaryVariableValue: 10 };
    const runner = makeRunner("x_next = x + 100\ny_next = y", { x: 0, y: 0 }, 42, 0, limits);
    const before = { x: runner.current.x, y: runner.current.y };
    const result = runner.step();
    expect(result.errored).toBe(true);
    expect(runner.status).toBe("error");
    expect(runner.current.x).toBe(before.x);
    expect(runner.current.y).toBe(before.y);
    expect(runner.lastError).toMatch(/safety bound/i);
  });

  it("does not trigger the primary-variable bound when comfortably within it", () => {
    const limits: SimLimits = { ...DEFAULT_SIM_LIMITS, maxAbsPrimaryVariableValue: 1000 };
    const runner = makeRunner("x_next = x + 5\ny_next = y", { x: 0, y: 0 }, 42, 0, limits);
    const result = runner.step();
    expect(result.errored).toBe(false);
    expect(runner.status).not.toBe("error");
  });

  it("stops when loss exceeds maxAbsLoss, preserving last valid state", () => {
    // f(x,y) = (x-3)^2 + 4(y+1)^2 — moving x far away makes loss huge.
    const limits: SimLimits = { ...DEFAULT_SIM_LIMITS, maxAbsLoss: 100 };
    const runner = makeRunner("x_next = x + 1000\ny_next = y", { x: 0, y: 0 }, 42, 0, limits);
    const before = { x: runner.current.x, y: runner.current.y };
    const result = runner.step();
    expect(result.errored).toBe(true);
    expect(runner.status).toBe("error");
    expect(runner.current.x).toBe(before.x);
    expect(runner.current.y).toBe(before.y);
    expect(runner.lastError).toMatch(/safety bound/i);
  });

  it("a merely-oscillating (rapidly increasing) loss below the safety bounds keeps running, not erroring", () => {
    // A huge learning rate overshoots wildly step to step but stays within
    // the (generous, default) safety bounds — this must NOT enter 'error'.
    const runner = makeRunner("x_next = x - 5 * gx\ny_next = y - 5 * gy", { x: 0, y: 0 });
    const result = runner.step();
    expect(result.errored).toBe(false);
    expect(runner.status).not.toBe("error");
  });

  it("pauses (without erroring) once earlyStopLossThreshold is reached", () => {
    const limits: SimLimits = { ...DEFAULT_SIM_LIMITS, earlyStopLossThreshold: 1e-3 };
    const runner = makeRunner(GRADIENT_DESCENT, { x: 0, y: 0 }, 42, 0, limits);
    runner.play();
    for (let i = 0; i < 500 && runner.status === "running"; i++) runner.step();
    expect(runner.status).toBe("paused");
    expect(runner.current.loss).toBeLessThanOrEqual(1e-3);
  });

  it("does not early-stop while loss is still above the threshold", () => {
    const limits: SimLimits = { ...DEFAULT_SIM_LIMITS, earlyStopLossThreshold: 1e-9 };
    const runner = makeRunner(GRADIENT_DESCENT, { x: 0, y: 0 }, 42, 0, limits);
    runner.play();
    runner.step();
    expect(runner.status).toBe("running");
  });

  it("leaves earlyStopLossThreshold disabled (undefined) by default", () => {
    expect(DEFAULT_SIM_LIMITS.earlyStopLossThreshold).toBeUndefined();
  });

  it("pauses (without erroring) once maxIterations is reached", () => {
    const limits: SimLimits = { ...DEFAULT_SIM_LIMITS, maxIterations: 3 };
    const runner = makeRunner(GRADIENT_DESCENT, { x: 0, y: 0 }, 42, 0, limits);
    runner.play();
    runner.step();
    runner.step();
    expect(runner.status).toBe("running");
    runner.step();
    expect(runner.iteration).toBe(3);
    expect(runner.status).toBe("paused");
  });

  it("setSimLimits takes effect on the very next step, unlike seed", () => {
    const runner = makeRunner("x_next = x + 100\ny_next = y", { x: 0, y: 0 }, 42, 0, { ...DEFAULT_SIM_LIMITS, maxAbsPrimaryVariableValue: 1000 });
    const result1 = runner.step();
    expect(result1.errored).toBe(false);
    runner.setSimLimits({ ...DEFAULT_SIM_LIMITS, maxAbsPrimaryVariableValue: 10 });
    const result2 = runner.step();
    expect(result2.errored).toBe(true);
  });
});

describe("SimulationRunner: arbitrary user-named state variables", () => {
  it("accumulates several independently-named state variables correctly, not just vx/vy", () => {
    const source = [
      "state moment1 = 0",
      "state moment2 = 0",
      "moment1 = moment1 + gx",
      "moment2 = moment2 + 1",
      "x_next = x - 0.01 * moment1",
      "y_next = y",
    ].join("\n");
    const runner = makeRunner(source, { x: 0, y: 0 });
    // gx = 2*(x-3) = -6 at x=0, held fixed here since y_next=y and x barely moves in one step.
    runner.step();
    expect(runner.currentStateValues.moment1).toBeCloseTo(-6, 9);
    expect(runner.currentStateValues.moment2).toBe(1);
    runner.step();
    expect(runner.currentStateValues.moment2).toBe(2);
  });
});
