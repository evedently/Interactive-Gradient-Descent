import { describe, expect, it } from "vitest";
import { deriveSeed, SeededRng } from "../../../../src/domain/simulation/SeededRng";

describe("SeededRng", () => {
  it("is deterministic: the same seed produces the same sequence", () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different sequences", () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("next() stays within [0, 1)", () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("normal() is deterministic given the same seed and produces a roughly standard-normal sample distribution", () => {
    const a = new SeededRng(99);
    const b = new SeededRng(99);
    expect(a.normal()).toBe(b.normal());

    const rng = new SeededRng(123);
    const samples = Array.from({ length: 5000 }, () => rng.normal());
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
    expect(mean).toBeCloseTo(0, 1);
    expect(variance).toBeCloseTo(1, 0);
  });
});

describe("deriveSeed", () => {
  it("is deterministic for the same (workspaceSeed, ruleId) pair", () => {
    expect(deriveSeed(42, "rule-abc")).toBe(deriveSeed(42, "rule-abc"));
  });

  it("differs across rule ids for the same workspace seed", () => {
    expect(deriveSeed(42, "rule-a")).not.toBe(deriveSeed(42, "rule-b"));
  });

  it("differs across workspace seeds for the same rule id", () => {
    expect(deriveSeed(1, "rule-a")).not.toBe(deriveSeed(2, "rule-a"));
  });

  it("always returns a non-negative 32-bit integer", () => {
    const seed = deriveSeed(42, "some-rule-id");
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});
