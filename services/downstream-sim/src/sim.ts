export type LatencyShape = "uniform" | "lognormal";

export type SimConfig = {
  latency_ms: number;
  jitter_ms: number;
  latency_shape: LatencyShape;
  error_rate: number;
  timeout_rate: number;
  rate_limit_rps: number;
  seed: number;
};

export type Outcome = "ok" | "error" | "timeout";

export const DEFAULT_CONFIG: SimConfig = {
  latency_ms: 0,
  jitter_ms: 0,
  latency_shape: "uniform",
  error_rate: 0,
  timeout_rate: 0,
  rate_limit_rps: 0,
  seed: 1,
};

// mulberry32: a seeded stream, so "three runs before believing a number" can be reproduced.
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Jitter is symmetric, so p50 of a jittered latency is still latency_ms.
export function jitteredLatency(
  latency_ms: number,
  jitter_ms: number,
  rnd: () => number,
): number {
  const spread = jitter_ms * (2 * rnd() - 1);
  return Math.max(0, latency_ms + spread);
}

// Median stays latency_ms; jitter_ms/latency_ms is the log-space sigma, so the 1-sigma
// band is roughly the uniform shape's full range and the two are directly comparable.
export function lognormalLatency(
  latency_ms: number,
  jitter_ms: number,
  rnd: () => number,
): number {
  if (latency_ms <= 0) return 0;
  const sigma = jitter_ms / latency_ms;
  // Box-Muller; 1 - rnd() keeps the log argument off zero.
  const normal = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  return latency_ms * Math.exp(sigma * normal);
}

export function drawLatency(
  shape: LatencyShape,
  latency_ms: number,
  jitter_ms: number,
  rnd: () => number,
): number {
  return shape === "lognormal"
    ? lognormalLatency(latency_ms, jitter_ms, rnd)
    : jitteredLatency(latency_ms, jitter_ms, rnd);
}

// Independent draws, error wins — same rule spec/openapi.yaml gives /flaky.
export function drawOutcome(config: SimConfig, rnd: () => number): Outcome {
  const error = rnd() < config.error_rate;
  const timeout = rnd() < config.timeout_rate;
  if (error) return "error";
  return timeout ? "timeout" : "ok";
}

// Token bucket: capacity and refill are both rps, so a burst costs the next second.
export function createLimiter(now: () => number = Date.now): (rps: number) => boolean {
  let tokens = Number.POSITIVE_INFINITY;
  let last = now();
  return (rps) => {
    if (rps <= 0) return true;
    const t = now();
    tokens = Math.min(rps, tokens + ((t - last) / 1000) * rps);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}
