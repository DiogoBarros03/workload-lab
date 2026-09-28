import { expect, test } from "vitest";
import {
  detailLine, failedCount, groupRuns, monoDigits, oomKilled, parseBaseline, runPresetFrom, shortfallPct, verdictFor, verdictTone, type Run,
} from "./baseline";

const run = (over: Partial<Run> = {}): Run => ({
  op: "write", targetRps: 2000, achievedRps: 984, p50: 9545.2, p99: 12355.7, dropped: 10352, errors: 24437,
  maxInFlight: 10000, peakCpuCores: 0.51, throttledPeriods: 86, peakMemMiB: 127.9, peakPoolWaiting: 9980,
  peakCommitsPerSec: 594, cause: "memory ceiling; api OOM-killed (exit 137), down mid-run", verdict: "failed", ...over,
});
const setup = { apiCpu: 0.5, apiMemMiB: 128, poolMax: 10, dbCpu: 1, dbMemMiB: 256, durationSec: 20 };
const doc = (over: Record<string, unknown> = {}) => ({ measuredAt: "2026-09-25", setup, runs: [run()], findings: ["a"], ...over });

test("parseBaseline returns a well-formed document unchanged", () => {
  const d = doc();
  expect(parseBaseline(d)).toEqual(d);
});

test("parseBaseline throws naming the broken field", () => {
  expect(() => parseBaseline(null)).toThrow("baseline: not an object");
  expect(() => parseBaseline(doc({ measuredAt: 5 }))).toThrow("measuredAt");
  expect(() => parseBaseline(doc({ setup: { ...setup, poolMax: "10" } }))).toThrow("setup.poolMax");
  expect(() => parseBaseline(doc({ runs: {} }))).toThrow("runs");
  expect(() => parseBaseline(doc({ runs: [run({ op: "delete" as never })] }))).toThrow("runs[0].op");
  expect(() => parseBaseline(doc({ runs: [run(), run({ verdict: "bad" as never })] }))).toThrow("runs[1].verdict");
  expect(() => parseBaseline(doc({ runs: [run({ p99: Number.NaN })] }))).toThrow("runs[0].p99");
  expect(() => parseBaseline(doc({ findings: ["a", 2] }))).toThrow("findings");
  expect(() => parseBaseline(doc({ findings: undefined }))).toThrow("findings");
});

test("verdictTone maps ok, degraded and failed to green, yellow, red", () => {
  expect(verdictTone("ok")).toBe("green");
  expect(verdictTone("degraded")).toBe("yellow");
  expect(verdictTone("failed")).toBe("red");
});

test("oomKilled reads the cause", () => {
  expect(oomKilled(run())).toBe(true);
  expect(oomKilled(run({ cause: "memory ceiling: 128.0 MiB of 128, socket throttling" }))).toBe(false);
});

test("runPresetFrom takes op and target rate from the run and the measured duration", () => {
  expect(runPresetFrom(run({ op: "mixed", targetRps: 3000 }), 20)).toEqual({ op: "mixed", rps: 3000, durationSec: 20 });
  expect(runPresetFrom(run({ op: "read", targetRps: 100 }), 45)).toEqual({ op: "read", rps: 100, durationSec: 45 });
});

const monoOf = (s: string) => monoDigits(s).filter((p) => p.mono).map((p) => p.text);

test("monoDigits splits digit runs out, keeping thousands groups and decimals whole", () => {
  expect(monoDigits("at 0.26 cores")).toEqual([
    { text: "at ", mono: false }, { text: "0.26", mono: true }, { text: " cores", mono: false },
  ]);
  expect(monoOf("each with 20 729 to 24 437 errors and 10 000 in flight")).toEqual(["20 729", "24 437", "10 000"]);
  expect(monoOf("write 2000, 3000, 5000 and mixed 3000")).toEqual(["2000", "3000", "5000", "3000"]);
  expect(monoOf("p99 15.1 ms (exit 137)")).toEqual(["15.1", "137"]);
  expect(monoDigits("no numbers")).toEqual([{ text: "no numbers", mono: false }]);
  expect(monoDigits("")).toEqual([]);
  expect(monoDigits("5000").map((p) => p.text).join("")).toBe("5000");
});

test("groupRuns orders groups read, write, mixed and runs by target, without mutating", () => {
  const runs = [run({ op: "mixed", targetRps: 3000 }), run({ op: "read", targetRps: 5000 }), run({ op: "write", targetRps: 100 }),
    run({ op: "read", targetRps: 100 }), run({ op: "mixed", targetRps: 1000 })];
  const before = runs.map((r) => `${r.op}-${r.targetRps}`);
  const groups = groupRuns(runs);
  expect(groups.map((g) => [g.op, g.runs.map((r) => r.targetRps)])).toEqual([["read", [100, 5000]], ["write", [100]], ["mixed", [1000, 3000]]]);
  expect(runs.map((r) => `${r.op}-${r.targetRps}`)).toEqual(before);
});

test("groupRuns leaves out operations with no runs", () => {
  expect(groupRuns([run({ op: "mixed" })]).map((g) => g.op)).toEqual(["mixed"]);
  expect(groupRuns([])).toEqual([]);
});

test("failedCount adds dropped and errors", () => {
  expect(failedCount(run({ dropped: 9051, errors: 2874 }))).toBe(11925);
  expect(failedCount(run({ dropped: 0, errors: 7 }))).toBe(7);
  expect(failedCount(run({ dropped: 0, errors: 0 }))).toBe(0);
});

test("shortfallPct is null at 95 % of target or more, else the rounded shortfall", () => {
  expect(shortfallPct(run({ targetRps: 1000, achievedRps: 950 }))).toBeNull();
  expect(shortfallPct(run({ targetRps: 100, achievedRps: 100 }))).toBeNull();
  expect(shortfallPct(run({ targetRps: 1000, achievedRps: 949 }))).toBe(5);
  expect(shortfallPct(run({ targetRps: 5000, achievedRps: 3731.1 }))).toBe(25);
  expect(shortfallPct(run({ targetRps: 3000, achievedRps: 799.8 }))).toBe(73);
});

const quiet = { peakCpuCores: 0.26, throttledPeriods: 0, peakPoolWaiting: 10, maxInFlight: 12, p50: 1.3, dropped: 0, errors: 0 };

test("detailLine joins the secondary numbers, with the CPU quota when known", () => {
  expect(detailLine(run(quiet), 0.5)).toBe("Peak CPU 0.26 / 0.50 cores · Throttled 0 · Pool waiting 10 · Max in flight 12 · p50 1.30 ms");
  expect(detailLine(run(quiet))).toBe("Peak CPU 0.26 cores · Throttled 0 · Pool waiting 10 · Max in flight 12 · p50 1.30 ms");
});

test("detailLine appends dropped and errors only when something failed", () => {
  expect(detailLine(run({ ...quiet, dropped: 10352, errors: 0 }), 0.5)).toBe(
    "Peak CPU 0.26 / 0.50 cores · Throttled 0 · Pool waiting 10 · Max in flight 12 · p50 1.30 ms · Dropped 10\u2009352 · Errors 0",
  );
  expect(detailLine(run({ ...quiet, maxInFlight: 10000, p50: 9545.2, errors: 24437 }), 0.5)).toBe(
    "Peak CPU 0.26 / 0.50 cores · Throttled 0 · Pool waiting 10 · Max in flight 10\u2009000 · p50 9\u2009545 ms · Dropped 0 · Errors 24\u2009437",
  );
});

test("verdictFor returns the verdict of the measured run with the same op and target", () => {
  const b = parseBaseline(doc({ runs: [run({ op: "read", targetRps: 1000, verdict: "ok" }), run({ op: "write", targetRps: 1000, verdict: "degraded" })] }));
  expect(verdictFor({ op: "write", rps: 1000 }, b)).toBe("degraded");
  expect(verdictFor({ op: "read", rps: 1000 }, b)).toBe("ok");
  expect(verdictFor({ op: "read", rps: 4000 }, b)).toBeNull();
  expect(verdictFor({ op: "mixed", rps: 1000 }, b)).toBeNull();
});
