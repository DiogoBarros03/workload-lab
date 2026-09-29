import type { Point } from "./run";

export type LivePoint = { t: number; rps: number; target: number; p99: number | null; errors: number; error: boolean };

export const toLivePoints = (series: Point[]): LivePoint[] =>
  series.map((p) => ({ t: p.elapsedMs / 1000, rps: p.rps, target: p.targetRps, p99: p.p99, errors: p.errors, error: p.errors > 0 }));

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
