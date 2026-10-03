import { describe, expect, it } from "vitest";
import type { Steppable } from "../../../../src/domain/simulation/RunnerInterfaces";
import type { RunnerStatus } from "../../../../src/domain/simulation/types";
import { pauseHiddenRunners, pickFocusedEntry, playVisibleRunners } from "../../../../src/domain/simulation/ruleRunControl";

class FakeRunner implements Steppable {
  constructor(public status: RunnerStatus = "idle") {}
  subscribe() {
    return () => {};
  }
  play() {
    this.status = "running";
  }
  pause() {
    this.status = "paused";
  }
  step() {
    return { errored: false };
  }
  reset() {
    this.status = "idle";
  }
}

function entry(visible: boolean, status: RunnerStatus = "idle") {
  return { rule: { visible }, runner: new FakeRunner(status) };
}

describe("playVisibleRunners", () => {
  it("playVisibleRunners_mixedVisibility_playsOnlyVisibleRules", () => {
    const shown = entry(true);
    const hidden = entry(false);

    playVisibleRunners([shown, hidden]);

    expect(shown.runner.status).toBe("running");
    expect(hidden.runner.status).toBe("idle");
  });

  it("playVisibleRunners_allHidden_playsNothing", () => {
    const entries = [entry(false), entry(false)];
    playVisibleRunners(entries);
    expect(entries.map((e) => e.runner.status)).toEqual(["idle", "idle"]);
  });
});

describe("pauseHiddenRunners", () => {
  it("pauseHiddenRunners_hiddenRunningRule_isPaused", () => {
    const hidden = entry(false, "running");
    pauseHiddenRunners([hidden]);
    expect(hidden.runner.status).toBe("paused");
  });

  it("pauseHiddenRunners_visibleRunningRule_keepsRunning", () => {
    const shown = entry(true, "running");
    pauseHiddenRunners([shown]);
    expect(shown.runner.status).toBe("running");
  });

  it("pauseHiddenRunners_hiddenNonRunningRule_statusUntouched", () => {
    const entries = [entry(false, "idle"), entry(false, "paused"), entry(false, "error")];
    pauseHiddenRunners(entries);
    expect(entries.map((e) => e.runner.status)).toEqual(["idle", "paused", "error"]);
  });
});

describe("pickFocusedEntry", () => {
  const a = { rule: { id: "a", visible: true }, runner: new FakeRunner() };
  const b = { rule: { id: "b", visible: true }, runner: new FakeRunner() };
  const hidden = { rule: { id: "h", visible: false }, runner: new FakeRunner() };

  it("pickFocusedEntry_focusedVisibleRule_returnsIt", () => {
    expect(pickFocusedEntry([a, b], "b")).toBe(b);
  });

  it("pickFocusedEntry_noFocus_firstVisible", () => {
    expect(pickFocusedEntry([hidden, a, b], null)).toBe(a);
  });

  it("pickFocusedEntry_focusedRuleHidden_fallsBackToFirstVisible", () => {
    expect(pickFocusedEntry([hidden, b], "h")).toBe(b);
  });

  it("pickFocusedEntry_focusedRuleRemoved_fallsBackToFirstVisible", () => {
    expect(pickFocusedEntry([a, b], "gone")).toBe(a);
  });

  it("pickFocusedEntry_nothingVisible_null", () => {
    expect(pickFocusedEntry([hidden], null)).toBeNull();
  });
});
