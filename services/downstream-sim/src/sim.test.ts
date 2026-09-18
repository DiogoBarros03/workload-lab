import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONFIG,
  createLimiter,
  createRng,
  drawLatency,
  drawOutcome,
  jitteredLatency,
  lognormalLatency,
} from "./sim.ts";

const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("jitteredLatency", () => {
  it("spans latency +/- jitter and centres on latency", () => {
    expect(jitteredLatency(100, 20, () => 0)).toBe(80);
    expect(jitteredLatency(100, 20, () => 0.5)).toBe(100);
    expect(jitteredLatency(100, 20, () => 1)).toBe(120);
  });

  it("never goes negative", () => {
    expect(jitteredLatency(5, 50, () => 0)).toBe(0);
  });
});

describe("drawOutcome", () => {
  it("lets error win when both rates fire", () => {
    const config = { ...DEFAULT_CONFIG, error_rate: 1, timeout_rate: 1 };
    expect(drawOutcome(config, () => 0)).toBe("error");
  });

  it("draws the two rates independently", () => {
    const config = { ...DEFAULT_CONFIG, error_rate: 0.5, timeout_rate: 0.5 };
    expect(drawOutcome(config, seq([0.9, 0.1]))).toBe("timeout");
    expect(drawOutcome(config, seq([0.9, 0.9]))).toBe("ok");
  });
});

describe("createLimiter", () => {
  it("passes everything when rps is 0", () => {
    const take = createLimiter(() => 0);
    expect(Array.from({ length: 100 }, () => take(0)).every(Boolean)).toBe(true);
  });

  it("allows rps calls in a burst then refuses", () => {
    const clock = 0;
    const take = createLimiter(() => clock);
    const allowed = Array.from({ length: 20 }, () => take(10)).filter(Boolean).length;
    expect(allowed).toBe(10);
  });

  it("refills at rps per second", () => {
    let clock = 0;
    const take = createLimiter(() => clock);
    Array.from({ length: 10 }, () => take(10));
    expect(take(10)).toBe(false);
    clock = 1000;
    expect(Array.from({ length: 20 }, () => take(10)).filter(Boolean).length).toBe(10);
  });
});

describe("createRng", () => {
  // Red if the generator stops depending on the seed, or stops being deterministic.
  it("replays for the same seed and diverges for a different one", () => {
    const draw = (seed: number) => Array.from({ length: 8 }, createRng(seed));
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
  });

  it("stays inside [0, 1)", () => {
    const rnd = createRng(1);
    const values = Array.from({ length: 500 }, rnd);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});

// Box-Muller consumes two draws: cos(2*pi*0.25) is 0, so [_, 0.25] is the median.
const MEDIAN_DRAW = [0.5, 0.25];
// sqrt(-2*ln(1-u)) is 2 at u = 1-e^-2, and cos(0) is 1, so this is exactly +2 sigma.
const PLUS_TWO_SIGMA = [1 - Math.exp(-2), 0];

describe("lognormalLatency", () => {
  // Red if the parameterisation stops putting the median at latency_ms — the whole
  // point of the shape is that it is comparable to uniform at the same latency_ms.
  it("puts the median exactly on latency_ms whatever the jitter", () => {
    expect(lognormalLatency(100, 20, seq(MEDIAN_DRAW))).toBeCloseTo(100, 6);
    expect(lognormalLatency(100, 80, seq(MEDIAN_DRAW))).toBeCloseTo(100, 6);
  });

  // Red if jitter_ms stops mapping to sigma as a fraction of the median.
  it("maps jitter_ms/latency_ms onto log-space sigma", () => {
    expect(lognormalLatency(100, 20, seq(PLUS_TWO_SIGMA))).toBeCloseTo(100 * Math.exp(0.4), 6);
    expect(lognormalLatency(100, 0, seq(PLUS_TWO_SIGMA))).toBeCloseTo(100, 6);
  });

  // Red if the tail is ever clipped to latency_ms + jitter_ms the way uniform is.
  it("reaches past the uniform shape's ceiling", () => {
    expect(lognormalLatency(100, 20, seq(PLUS_TWO_SIGMA))).toBeGreaterThan(120);
  });

  // Red if latency_ms 0 divides by zero and returns NaN, which would sleep forever.
  it("is 0 at latency_ms 0 rather than NaN", () => {
    expect(lognormalLatency(0, 50, seq([0.9, 0.9]))).toBe(0);
  });
});

describe("drawLatency", () => {
  // Red if /call's shape switch stops selecting a distribution.
  it("dispatches on the shape", () => {
    expect(drawLatency("uniform", 100, 20, () => 1)).toBe(120);
    expect(drawLatency("lognormal", 100, 20, seq(MEDIAN_DRAW))).toBeCloseTo(100, 6);
  });
});
