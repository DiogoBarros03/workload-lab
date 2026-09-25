export type Op = "read" | "write" | "mixed";
// Open model: requests arrive at a fixed rate, finished or not.
export type RunConfig = { mode: "open"; op: Op; rps: number; durationSec: number };
export type Window = { reqs: number; rps: number; p50: number | null; p99: number | null; errors: number };
export type Progress = {
  done: number;
  inFlight: number;
  elapsedMs: number;
  dropped: number;
  targetRps: number;
  window?: Window;
};
export type Latency = { p50: number; p95: number; p99: number; max: number; mean: number };
export type Result = {
  requests: number;
  durationMs: number;
  rps: number;
  dropped: number;
  targetRps: number;
  maxInFlightSeen: number;
  statusCounts: Record<string, number>;
  errors: number;
  latency: Latency | null;
};
export type Point = { elapsedMs: number; rps: number; targetRps: number; p99: number | null };

export type RunState = {
  phase: "idle" | "running" | "done" | "error";
  config: RunConfig | null;
  progress: Progress | null;
  series: Point[];
  result: Result | null;
  message: string | null;
};

export type RunAction =
  | { type: "start"; config: RunConfig }
  | { type: "progress"; progress: Progress }
  | { type: "result"; result: Result }
  | { type: "error"; message: string }
  | { type: "stop" };

export const SERIES_CAP = 600;

export const initialRun: RunState = { phase: "idle", config: null, progress: null, series: [], result: null, message: null };

const settled = (p: Progress | null) => (p ? { ...p, inFlight: 0 } : null);

function appendPoint(series: Point[], p: Progress): Point[] {
  if (!p.window) return series;
  return [...series, { elapsedMs: p.elapsedMs, rps: p.window.rps, targetRps: p.targetRps, p99: p.window.p99 }].slice(-SERIES_CAP);
}

function settle(s: RunState, a: Exclude<RunAction, { type: "start" }>): RunState {
  switch (a.type) {
    case "progress":
      return { ...s, progress: a.progress, series: appendPoint(s.series, a.progress) };
    case "result":
      return { ...s, phase: "done", result: a.result, progress: settled(s.progress) };
    case "error":
      return { ...s, phase: "error", message: a.message, progress: settled(s.progress) };
    case "stop":
      return { ...s, phase: "idle", progress: settled(s.progress) };
  }
}

export function runReducer(s: RunState, a: RunAction): RunState {
  if (a.type === "start") return { ...initialRun, phase: "running", config: a.config };
  // A stream may still deliver events after Stop; the run is already over.
  if (s.phase !== "running") return s;
  return settle(s, a);
}

// Open runs end by time, so progress is elapsed over duration.
export const progressFraction = (elapsedMs: number, durationSec: number) =>
  Math.min(1, Math.max(0, elapsedMs / (durationSec * 1000)));
