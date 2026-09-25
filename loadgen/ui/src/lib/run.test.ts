import { expect, test } from "vitest";
import { initialRun, runReducer, type Progress, type Result, type RunState } from "./run";

const config = { op: "read" as const, requests: 1000, concurrency: 10 };
const result: Result = { requests: 1000, durationMs: 1000, rps: 1000, errors: 0, statusCounts: { "200": 1000 }, latency: null };
const progress = (done: number, withWindow = true): Progress => ({
  done, inFlight: 10, elapsedMs: done,
  ...(withWindow ? { window: { reqs: 5, rps: done * 2, p50: 1, p99: done / 10, errors: 0 } } : {}),
});
const running = (): RunState => runReducer(initialRun, { type: "start", config });

test("start clears the previous run and records the config", () => {
  const done = { ...running(), phase: "done" as const, result, message: "old" };
  const s = runReducer(done, { type: "start", config });
  expect(s).toEqual({ phase: "running", config, progress: null, series: [], result: null, message: null });
});

test("progress stores the counters and appends one point per window", () => {
  const s = runReducer(runReducer(running(), { type: "progress", progress: progress(100) }), { type: "progress", progress: progress(200) });
  expect(s.progress?.done).toBe(200);
  expect(s.series).toEqual([{ elapsedMs: 100, rps: 200, p99: 10 }, { elapsedMs: 200, rps: 400, p99: 20 }]);
});

test("progress without a window updates counters but adds no point", () => {
  const s = runReducer(running(), { type: "progress", progress: progress(5, false) });
  expect(s.progress?.done).toBe(5);
  expect(s.series).toEqual([]);
});

test("series is capped at 600 points, keeping the newest, without mutating", () => {
  let s = running();
  for (let i = 1; i <= 605; i++) s = runReducer(s, { type: "progress", progress: progress(i) });
  expect(s.series).toHaveLength(600);
  expect(s.series[0].elapsedMs).toBe(6);
  expect(s.series.at(-1)?.elapsedMs).toBe(605);
  const before = s.series;
  runReducer(s, { type: "progress", progress: progress(606) });
  expect(before).toHaveLength(600);
  expect(before.at(-1)?.elapsedMs).toBe(605);
});

test("result ends the run and keeps the series", () => {
  const withPoint = runReducer(running(), { type: "progress", progress: progress(10) });
  const s = runReducer(withPoint, { type: "result", result });
  expect(s.phase).toBe("done");
  expect(s.result).toEqual(result);
  expect(s.series).toHaveLength(1);
  expect(s.progress?.inFlight).toBe(0);
});

test("error ends the run with its message and nothing in flight", () => {
  const withProgress = runReducer(running(), { type: "progress", progress: progress(10) });
  const s = runReducer(withProgress, { type: "error", message: "a run is active" });
  expect(s.phase).toBe("error");
  expect(s.message).toBe("a run is active");
  expect(s.progress?.inFlight).toBe(0);
});

test("stop returns to idle with in-flight reset, keeping what was measured", () => {
  const withProgress = runReducer(running(), { type: "progress", progress: progress(10) });
  const s = runReducer(withProgress, { type: "stop" });
  expect(s.phase).toBe("idle");
  expect(s.progress).toEqual({ ...progress(10), inFlight: 0 });
  expect(s.series).toHaveLength(1);
});

test("events arriving after the run ended are ignored", () => {
  const stopped = runReducer(running(), { type: "stop" });
  expect(runReducer(stopped, { type: "progress", progress: progress(1) })).toBe(stopped);
  expect(runReducer(stopped, { type: "result", result })).toBe(stopped);
  expect(runReducer(stopped, { type: "error", message: "x" })).toBe(stopped);
});
