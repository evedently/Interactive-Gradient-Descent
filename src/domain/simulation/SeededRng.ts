/**
 * A small, fast, deterministic PRNG (mulberry32) — no cryptographic
 * requirement, just reproducibility (DESIGN.md §10): the same seed always
 * produces the same sequence of `next()`/`normal()` calls, within a single
 * JS runtime. Cross-runtime bit-for-bit identity is explicitly not
 * guaranteed (transcendental functions can differ in their last bit across
 * engines) — see the tolerance-based testing note in DESIGN.md §10.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Standard normal (mean 0, variance 1) via the Box-Muller transform, consuming two uniforms per call. */
  normal(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

/**
 * Derives a rule-specific seed from the shared workspace seed and that
 * rule's id (DESIGN.md §10/§18 Phase 6): running rule A alone must produce
 * the same stochastic trajectory as running it alongside rule B, so each
 * rule's stream may depend only on {workspaceSeed, ruleId} — never on how
 * many other rules exist or in what order. A simple FNV-1a-style mix; no
 * cryptographic property is needed, only determinism.
 */
export function deriveSeed(workspaceSeed: number, ruleId: string): number {
  let h = workspaceSeed >>> 0;
  for (let i = 0; i < ruleId.length; i++) {
    h ^= ruleId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
