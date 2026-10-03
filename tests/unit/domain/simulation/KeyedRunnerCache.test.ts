import { describe, expect, it } from "vitest";
import { KeyedRunnerCache } from "../../../../src/domain/simulation/KeyedRunnerCache";

interface FakeRule {
  id: string;
  compiled: object;
}

function makeCache() {
  let created = 0;
  const cache = new KeyedRunnerCache<{ n: number; ruleId: string }>();
  const sync = (rules: FakeRule[], shared: object) =>
    cache.sync(
      rules,
      (rule) => [shared, rule.compiled],
      (rule) => ({ n: ++created, ruleId: rule.id }),
    );
  return { cache, sync };
}

describe("KeyedRunnerCache", () => {
  it("sync_newRules_createsOneRunnerPerRule", () => {
    const { cache, sync } = makeCache();
    const shared = {};
    sync([{ id: "a", compiled: {} }, { id: "b", compiled: {} }], shared);
    expect([...cache.runners.keys()]).toEqual(["a", "b"]);
  });

  it("sync_unchangedKeys_keepsSameRunnerInstances", () => {
    const { cache, sync } = makeCache();
    const shared = {};
    const rules = [{ id: "a", compiled: {} }];
    sync(rules, shared);
    const first = cache.runners.get("a");
    sync(rules, shared);
    expect(cache.runners.get("a")).toBe(first);
  });

  it("sync_oneRulesKeyChanges_rebuildsOnlyThatRunner", () => {
    const { cache, sync } = makeCache();
    const shared = {};
    const a = { id: "a", compiled: {} };
    const b = { id: "b", compiled: {} };
    sync([a, b], shared);
    const runnerA = cache.runners.get("a");
    const runnerB = cache.runners.get("b");
    sync([a, { id: "b", compiled: {} }], shared);
    expect(cache.runners.get("a")).toBe(runnerA);
    expect(cache.runners.get("b")).not.toBe(runnerB);
  });

  it("sync_sharedKeyChanges_rebuildsEveryRunner", () => {
    const { cache, sync } = makeCache();
    const rules = [{ id: "a", compiled: {} }];
    sync(rules, {});
    const before = cache.runners.get("a");
    sync(rules, {});
    expect(cache.runners.get("a")).not.toBe(before);
  });

  it("sync_ruleRemoved_dropsItsRunner", () => {
    const { cache, sync } = makeCache();
    const shared = {};
    const a = { id: "a", compiled: {} };
    sync([a, { id: "b", compiled: {} }], shared);
    sync([a], shared);
    expect([...cache.runners.keys()]).toEqual(["a"]);
  });

  it("sync_emptyRules_clearsCache", () => {
    const { cache, sync } = makeCache();
    sync([{ id: "a", compiled: {} }], {});
    sync([], {});
    expect(cache.runners.size).toBe(0);
  });
});
