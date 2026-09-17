export type SimConfig = {
  latency_ms: number;
  jitter_ms: number;
  error_rate: number;
  timeout_rate: number;
  rate_limit_rps: number;
};

export type Outcome = "ok" | "error" | "timeout";

export const DEFAULT_CONFIG: SimConfig = {
  latency_ms: 0,
  jitter_ms: 0,
  error_rate: 0,
  timeout_rate: 0,
  rate_limit_rps: 0,
};

// Jitter is symmetric, so p50 of a jittered latency is still latency_ms.
export function jitteredLatency(
  latency_ms: number,
  jitter_ms: number,
  rnd: () => number = Math.random,
): number {
  const spread = jitter_ms * (2 * rnd() - 1);
  return Math.max(0, latency_ms + spread);
}

// Independent draws, error wins — same rule spec/openapi.yaml gives /flaky.
export function drawOutcome(config: SimConfig, rnd: () => number = Math.random): Outcome {
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
