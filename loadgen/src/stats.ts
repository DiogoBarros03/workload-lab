export type Sample = { status: number | null; ms: number };

export type Latency = { p50: number; p95: number; p99: number; max: number; mean: number };

export type Stats = {
  requests: number;
  durationMs: number;
  rps: number;
  statusCounts: Record<string, number>;
  errors: number;
  latency: Latency | null;
};

export type Window = { reqs: number; rps: number; p50: number | null; p99: number | null; errors: number };

// Nearest-rank: the smallest value with at least p% of samples at or below it.
export const percentile = (sorted: readonly number[], p: number) =>
  sorted[Math.ceil((p / 100) * sorted.length) - 1];

const sortedMs = (samples: readonly Sample[]) => samples.map((s) => s.ms).toSorted((a, b) => a - b);

const rate = (count: number, ms: number) => (ms > 0 ? count / (ms / 1000) : 0);

function latencyOf(samples: readonly Sample[]): Latency | null {
  if (samples.length === 0) return null;
  const sorted = sortedMs(samples);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
  };
}

function countStatuses(samples: readonly Sample[]): Record<string, number> {
  return samples.reduce<Record<string, number>>((acc, { status }) => {
    if (status === null) return acc;
    return { ...acc, [status]: (acc[status] ?? 0) + 1 };
  }, {});
}

export function summarize(samples: readonly Sample[], durationMs: number): Stats {
  return {
    requests: samples.length,
    durationMs,
    rps: rate(samples.length, durationMs),
    statusCounts: countStatuses(samples),
    errors: samples.filter((s) => s.status === null).length,
    latency: latencyOf(samples),
  };
}

// Live view: any failed response counts, unlike the final result's network-only errors.
export function windowOf(samples: readonly Sample[], intervalMs: number): Window {
  const sorted = sortedMs(samples);
  const empty = sorted.length === 0;
  return {
    reqs: samples.length,
    rps: rate(samples.length, intervalMs),
    p50: empty ? null : percentile(sorted, 50),
    p99: empty ? null : percentile(sorted, 99),
    errors: samples.filter((s) => s.status === null || s.status >= 400).length,
  };
}
