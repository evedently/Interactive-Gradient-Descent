import { describe, expect, it } from "vitest";
import { parseLossFunction, toResolvedLoss } from "../../../../src/domain/lossFunction";
import { parseRuleSource } from "../../../../src/domain/rules/ruleParser";
import { compileRule } from "../../../../src/domain/rules/ruleCompiler";
import { deriveSeed } from "../../../../src/domain/simulation/SeededRng";
import { SimulationRunner } from "../../../../src/domain/simulation/SimulationRunner";

const LOSS_SOURCE = "(x - 3)^2 + 4*(y + 1)^2";

function makeRunner(ruleSource: string, start = { x: 0, y: 0 }, seed = 42, noiseLevel = 0) {
  const loss = parseLossFunction(LOSS_SOURCE);
  if (!loss.ok) throw new Error("fixture loss failed to parse");
  const { program, errors } = parseRuleSource(ruleSource);
  if (!program) throw new Error(`fixture rule failed to parse: ${JSON.stringify(errors)}`);
  const { compiled, errors: compileErrors } = compileRule(program);
  if (!compiled) throw new Error(`fixture rule failed to compile: ${JSON.stringify(compileErrors)}`);
  return new SimulationRunner(toResolvedLoss(loss), compiled, start, seed, noiseLevel);
}

const GRADIENT_DESCENT = "x_next = x - 0.1 * gx\ny_next = y - 0.1 * gy";
const MOMENTUM = [
  "parameter eta = 0.05 range 0.0001 to 1",
  "parameter beta = 0.8 range 0 to 0.999",
  "state vx = 0",
  "state vy = 0",
  "vx_next = beta * vx - eta * gx",
  "vy_next = beta * vy - eta * gy",
  "x_next = x + vx_next",
  "y_next = y + vy_next",
  "vx = vx_next",
  "vy = vy_next",
].join("\n");

describe("Phase 4 acceptance: independently-configured rules run concurrently without cross-contamination", () => {
  it("two different rules on the same loss surface keep fully independent state and trajectories", () => {
    const gdAlone = makeRunner(GRADIENT_DESCENT);
    const momentumAlone = makeRunner(MOMENTUM);

    const gdConcurrent = makeRunner(GRADIENT_DESCENT);
    const momentumConcurrent = makeRunner(MOMENTUM);

    // Interleave stepping the two "concurrent" runners, as if both rule
    // panels were running at once, vs. stepping each "alone" runner in
    // isolation the same number of times.
    for (let i = 0; i < 30; i++) {
      gdConcurrent.step();
      momentumConcurrent.step();
    }
    for (let i = 0; i < 30; i++) gdAlone.step();
    for (let i = 0; i < 30; i++) momentumAlone.step();

    // Running alongside another rule must not perturb either one's result.
    expect(gdConcurrent.current.x).toBe(gdAlone.current.x);
    expect(gdConcurrent.current.y).toBe(gdAlone.current.y);
    expect(momentumConcurrent.current.x).toBe(momentumAlone.current.x);
    expect(momentumConcurrent.current.y).toBe(momentumAlone.current.y);
    expect(momentumConcurrent.currentStateValues.vx).toBe(momentumAlone.currentStateValues.vx);

    // And the two concurrent rules must genuinely differ from each other
    // (different update rule => different trajectory), proving they are
    // not secretly sharing state.
    expect(gdConcurrent.current.x).not.toBeCloseTo(momentumConcurrent.current.x, 3);
  });

  it("independent play/pause/reset: pausing/resetting one rule does not affect another", () => {
    const ruleA = makeRunner(GRADIENT_DESCENT);
    const ruleB = makeRunner(GRADIENT_DESCENT, { x: 5, y: 5 });

    ruleA.play();
    ruleB.play();
    ruleA.step();
    ruleB.step();
    ruleB.step();

    ruleA.pause();
    expect(ruleA.status).toBe("paused");
    expect(ruleB.status).toBe("running"); // unaffected by A's pause

    ruleB.reset();
    expect(ruleB.iteration).toBe(0);
    expect(ruleB.current.x).toBe(5); // back to its own start point
    expect(ruleA.iteration).toBe(1); // unaffected by B's reset
    expect(ruleA.status).toBe("paused");
  });
});

describe("Phase 4 acceptance: two identically-configured rules produce identical trajectories", () => {
  it("same loss, same rule text, same start point, same seed => identical trajectories every step", () => {
    const ruleA = makeRunner(MOMENTUM, { x: 1, y: -2 });
    const ruleB = makeRunner(MOMENTUM, { x: 1, y: -2 });

    for (let i = 0; i < 50; i++) {
      ruleA.step();
      ruleB.step();
      // Compare everything except `elapsedMs`, which is real wall-clock time
      // and may differ by a fraction of a millisecond between the two step()
      // calls — not a meaningful divergence in the simulated trajectory.
      const { elapsedMs: _a, ...restA } = ruleA.current;
      const { elapsedMs: _b, ...restB } = ruleB.current;
      expect(restA).toEqual(restB);
      expect(ruleA.currentStateValues).toEqual(ruleB.currentStateValues);
    }
  });
});

describe("Phase 6 acceptance: noise reproducibility", () => {
  const NOISY_GD = "x_next = x - 0.05 * gx\ny_next = y - 0.05 * gy";
  const WORKSPACE_SEED = 42;

  it("identical seed + settings reproduce the same noisy trajectory within a runtime", () => {
    const seed = deriveSeed(WORKSPACE_SEED, "rule-1");
    const runnerA = makeRunner(NOISY_GD, { x: 0, y: 0 }, seed, 0.5);
    const runnerB = makeRunner(NOISY_GD, { x: 0, y: 0 }, seed, 0.5);

    for (let i = 0; i < 40; i++) {
      runnerA.step();
      runnerB.step();
    }
    expect(runnerA.current.x).toBe(runnerB.current.x);
    expect(runnerA.current.y).toBe(runnerB.current.y);
    expect(runnerA.current.noisyGx).toBe(runnerB.current.noisyGx);
    // ...and it must actually BE noisy (not silently falling back to the true gradient).
    expect(runnerA.current.noisyGx).not.toBe(runnerA.current.gx);
  });

  it("rule A's noisy trajectory is identical whether it runs alone or alongside rule B — each rule's stream depends only on its own derived seed", () => {
    const seedA = deriveSeed(WORKSPACE_SEED, "rule-A");
    const seedB = deriveSeed(WORKSPACE_SEED, "rule-B");

    const aAlone = makeRunner(NOISY_GD, { x: 0, y: 0 }, seedA, 0.5);
    for (let i = 0; i < 25; i++) aAlone.step();

    const aWithB = makeRunner(NOISY_GD, { x: 0, y: 0 }, seedA, 0.5);
    const bAlongside = makeRunner(NOISY_GD, { x: 0, y: 0 }, seedB, 0.5);
    for (let i = 0; i < 25; i++) {
      aWithB.step();
      bAlongside.step();
    }

    expect(aWithB.current.x).toBe(aAlone.current.x);
    expect(aWithB.current.y).toBe(aAlone.current.y);
    expect(aWithB.current.noisyGx).toBe(aAlone.current.noisyGx);
    expect(aWithB.current.noisyGy).toBe(aAlone.current.noisyGy);
  });

  it("reset() reseeds the RNG so replaying from the start reproduces the same noisy sequence", () => {
    const seed = deriveSeed(WORKSPACE_SEED, "rule-1");
    const runner = makeRunner(NOISY_GD, { x: 0, y: 0 }, seed, 0.5);
    const firstRun = [];
    for (let i = 0; i < 10; i++) {
      runner.step();
      firstRun.push(runner.current.noisyGx);
    }

    runner.reset();
    const secondRun = [];
    for (let i = 0; i < 10; i++) {
      runner.step();
      secondRun.push(runner.current.noisyGx);
    }

    expect(secondRun).toEqual(firstRun);
  });

  it("setSeed does not take effect until the next reset", () => {
    const seed = deriveSeed(WORKSPACE_SEED, "rule-1");
    const control = makeRunner(NOISY_GD, { x: 0, y: 0 }, seed, 0.5); // untouched, same original seed throughout
    const runner = makeRunner(NOISY_GD, { x: 0, y: 0 }, seed, 0.5);

    runner.setSeed(seed + 999); // pending only — the live RNG is still the old seed's
    runner.step();
    control.step();
    expect(runner.current.noisyGx).toBe(control.current.noisyGx);

    runner.reset(); // the pending seed is applied now
    const reseeded = makeRunner(NOISY_GD, { x: 0, y: 0 }, seed + 999, 0.5);
    expect(runner.current.noisyGx).toBe(reseeded.current.noisyGx);
    expect(runner.current.noisyGx).not.toBe(control.current.noisyGx);
  });

  it("setNoiseLevel takes effect on the next step, no reset required", () => {
    const seed = deriveSeed(WORKSPACE_SEED, "rule-1");
    const runner = makeRunner(NOISY_GD, { x: 0, y: 0 }, seed, 0);
    expect(runner.current.noisyGx).toBe(runner.current.gx); // no noise yet

    runner.setNoiseLevel(1);
    runner.step();
    expect(runner.current.noisyGx).not.toBe(runner.current.gx); // now noisy, without any reset
  });
});
