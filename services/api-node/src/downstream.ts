// The downstream client. /io and /fanout differ only in how many calls they make.
// C06 wraps retries and the breaker around `settle`; nothing else here has to change.

export type Downstream = { url: string; timeoutMs: number };
export type Mode = "parallel" | "serial";
export type FanoutResult = { n: number; mode: Mode; ok: number; failed: number; ms: number };
export type Call = (signal: AbortSignal) => Promise<boolean>;

// knobs.md gives DOWNSTREAM_URL no default; this one keeps the image bootable without a sim.
const DEFAULT_URL = "http://127.0.0.1:8090";
const DEFAULT_TIMEOUT_MS = 1000;

export function readDownstream(env: NodeJS.ProcessEnv = process.env): Downstream {
  return {
    url: (env.DOWNSTREAM_URL ?? DEFAULT_URL).replace(/\/+$/, ""),
    timeoutMs: Number(env.DOWNSTREAM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  };
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
export async function settle(call: Call, signal: AbortSignal): Promise<boolean> {
  try {
    return await call(signal);
  } catch (error) {
    if (signal.aborted) throw error;
    return false;
  }
}

export async function fanout(
  call: Call,
  n: number,
  mode: Mode,
  signal: AbortSignal,
): Promise<FanoutResult> {
  const started = performance.now();
  const settled: boolean[] = [];
  if (mode === "parallel") {
    settled.push(...(await Promise.all(Array.from({ length: n }, () => settle(call, signal)))));
  } else {
    for (let i = 0; i < n; i += 1) settled.push(await settle(call, signal));
  }
  const ok = settled.filter(Boolean).length;
  return { n, mode, ok, failed: n - ok, ms: Math.round(performance.now() - started) };
}
