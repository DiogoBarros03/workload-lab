import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, createLimiter, drawOutcome, jitteredLatency } from "./sim.ts";

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
