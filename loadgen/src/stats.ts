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

// Nearest-rank: the smallest value with at least p% of samples at or below it.
const nearestRank = (sorted: readonly number[], p: number) =>
  sorted[Math.ceil((p / 100) * sorted.length) - 1];

function latencyOf(samples: readonly Sample[]): Latency | null {
  if (samples.length === 0) return null;
  const sorted = samples.map((s) => s.ms).toSorted((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    p50: nearestRank(sorted, 50),
    p95: nearestRank(sorted, 95),
    p99: nearestRank(sorted, 99),
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
    rps: durationMs > 0 ? samples.length / (durationMs / 1000) : 0,
    statusCounts: countStatuses(samples),
    errors: samples.filter((s) => s.status === null).length,
    latency: latencyOf(samples),
  };
}
