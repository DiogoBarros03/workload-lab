import type { Point } from "./run";
import type { CpuSample, DbSample } from "./status";

export type LivePoint = { t: number; rps: number; target: number; p99: number | null; errors: number; error: boolean };
export type CpuPoint = { t: number; cores: number; throttled: boolean };
export type DbPoint = { t: number; waiting: number | null; commits: number | null };

export const toLivePoints = (series: Point[]): LivePoint[] =>
  series.map((p) => ({ t: p.elapsedMs / 1000, rps: p.rps, target: p.targetRps, p99: p.p99, errors: p.errors, error: p.errors > 0 }));

function throttleRose(prev: CpuSample | undefined, cur: CpuSample) {
  return prev?.nrThrottled != null && cur.nrThrottled !== null && cur.nrThrottled > prev.nrThrottled;
}

// x is seconds before the newest sample, so the axis ends at 0.
export function cpuPoints(samples: CpuSample[]): CpuPoint[] {
  const last = samples.at(-1);
  if (!last) return [];
  return samples.map((s, i) => ({ t: (s.at - last.at) / 1000, cores: s.cores, throttled: throttleRose(samples[i - 1], s) }));
}

// Null values stay null so the lines break instead of dropping to zero.
export function dbPoints(samples: DbSample[]): DbPoint[] {
  const last = samples.at(-1);
  if (!last) return [];
  return samples.map((s) => ({ t: (s.at - last.at) / 1000, waiting: s.poolWaiting, commits: s.commitsPerSec }));
}

// Multiples of 5 s, at most about ten ticks across the run.
export function secondTicks(durationSec: number): number[] {
  const step = 5 * Math.max(1, Math.ceil(durationSec / 50));
  return Array.from({ length: Math.floor(durationSec / step) + 1 }, (_, i) => i * step);
}

// Round steps (1, 2, 2.5, 5 × 10^k) from zero up past max.
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) as number;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => +(i * step).toFixed(10));
}
