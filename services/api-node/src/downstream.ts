// The downstream client. /io and /fanout differ only in how many calls they make.
// Retries and the breaker live in `settle` — the one chokepoint every downstream call goes through.
import { setTimeout as sleep } from "node:timers/promises";

export type Downstream = { url: string; timeoutMs: number };
export type Mode = "parallel" | "serial";
export type FanoutResult = { n: number; mode: Mode; ok: number; failed: number; ms: number };
export type Call = (signal: AbortSignal) => Promise<boolean>;
export type Settled = { ok: boolean; attempts: number };

export type Retry = { max: number; backoffMs: number };
export type BreakerConfig = { enabled: boolean; threshold: number; resetMs: number };
export type BreakerState = "closed" | "open" | "half_open";
export type Breaker = {
  allow: () => boolean;
  record: (ok: boolean) => void;
  state: () => BreakerState;
};
export type Policy = { retry: Retry; breaker: Breaker };

// Thrown instead of calling, so the route can answer 503 without touching the network.
export class BreakerOpenError extends Error {}

// knobs.md gives DOWNSTREAM_URL no default; this one keeps the image bootable without a sim.
const DEFAULT_URL = "http://127.0.0.1:8090";
const DEFAULT_TIMEOUT_MS = 1000;
const DEFAULT_RETRY_BACKOFF_MS = 50;
const DEFAULT_BREAKER_THRESHOLD = 5;
const DEFAULT_BREAKER_RESET_MS = 5000;

export function readDownstream(env: NodeJS.ProcessEnv = process.env): Downstream {
  return {
    url: (env.DOWNSTREAM_URL ?? DEFAULT_URL).replace(/\/+$/, ""),
    timeoutMs: Number(env.DOWNSTREAM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  };
}

export function readRetry(env: NodeJS.ProcessEnv = process.env): Retry {
  return {
    max: Number(env.RETRY_MAX ?? 0),
    backoffMs: Number(env.RETRY_BACKOFF_MS ?? DEFAULT_RETRY_BACKOFF_MS),
  };
}

export function readBreakerConfig(env: NodeJS.ProcessEnv = process.env): BreakerConfig {
  return {
    enabled: env.BREAKER === "on",
    threshold: Number(env.BREAKER_FAILURE_THRESHOLD ?? DEFAULT_BREAKER_THRESHOLD),
    resetMs: Number(env.BREAKER_RESET_MS ?? DEFAULT_BREAKER_RESET_MS),
  };
}

// ponytail: one breaker for the whole process, because there is one downstream. Key it by
// host the day a second one exists. `now` is injected so the reset window is testable.
export function createBreaker(config: BreakerConfig, now: () => number = Date.now): Breaker {
  let failures = 0;
  let openedAt = 0;
  let probing = false;

  const state = (): BreakerState => {
    if (!config.enabled || failures < config.threshold) return "closed";
    return now() - openedAt < config.resetMs ? "open" : "half_open";
  };

  return {
    state,
    // Half-open admits exactly one probe; everyone else keeps failing fast until it lands.
    allow: () => {
      const current = state();
      if (current === "closed") return true;
      if (current === "open" || probing) return false;
      probing = true;
      return true;
    },
    record: (ok) => {
      probing = false;
      if (ok) {
        failures = 0;
        return;
      }
      failures += 1;
      if (failures >= config.threshold) openedAt = now();
    },
  };
}

// Full jitter: uniform over the whole exponential window, so retries never synchronise.
export function backoffMs(base: number, attempt: number, rnd: () => number = Math.random): number {
  return Math.round(rnd() * base * 2 ** (attempt - 1));
}

// /fanout has no latency parameters, so it lets sim config decide; /io overrides per request.
export function callUrl(down: Downstream, override?: { ms: number; jitter: number }): string {
  const query = override ? `?latency_ms=${override.ms}&jitter_ms=${override.jitter}` : "";
  return `${down.url}/call${query}`;
}

export function caller(url: string): Call {
  return async (signal) => {
    const res = await fetch(url, { signal });
    await res.arrayBuffer();
    return res.ok;
  };
}

// A non-2xx is a failed call; only the request-wide deadline escapes, and that is the 504.
async function once(call: Call, signal: AbortSignal): Promise<boolean> {
  try {
    return await call(signal);
  } catch (error) {
    if (signal.aborted) throw error;
    return false;
  }
}

// The chokepoint: the breaker decides whether to call at all, then retries run inside the
// caller's deadline (spec/knobs.md § Retry budget), so they may be cut short.
export async function settle(
  call: Call,
  signal: AbortSignal,
  policy: Policy,
): Promise<Settled> {
  if (!policy.breaker.allow()) throw new BreakerOpenError("breaker_open");
  let attempts = 0;
  try {
    for (;;) {
      attempts += 1;
      const ok = await once(call, signal);
      if (ok || attempts > policy.retry.max) {
        policy.breaker.record(ok);
        return { ok, attempts };
      }
      await sleep(backoffMs(policy.retry.backoffMs, attempts), undefined, { signal });
    }
  } catch (error) {
    // The deadline firing is a downstream failure too, so it trips the breaker like any other.
    policy.breaker.record(false);
    throw error;
  }
}

export async function fanout(
  call: Call,
  n: number,
  mode: Mode,
  signal: AbortSignal,
  policy: Policy,
): Promise<FanoutResult> {
  const started = performance.now();
  const settled: Settled[] = [];
  const one = () => settle(call, signal, policy);
  if (mode === "parallel") {
    settled.push(...(await Promise.all(Array.from({ length: n }, one))));
  } else {
    for (let i = 0; i < n; i += 1) settled.push(await one());
  }
  const ok = settled.filter((result) => result.ok).length;
  return { n, mode, ok, failed: n - ok, ms: Math.round(performance.now() - started) };
}
