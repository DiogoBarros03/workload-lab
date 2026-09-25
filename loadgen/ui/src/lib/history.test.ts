import { expect, test } from "vitest";
import { entryOf, historyKey, historyReducer, loadHistory, saveHistory, type HistoryEntry } from "./history";
import type { Result } from "./run";

const result: Result = {
  requests: 100, durationMs: 2000, rps: 50, dropped: 4, targetRps: 60, maxInFlightSeen: 9, errors: 2,
  statusCounts: { "200": 90, "409": 5, "500": 3 },
  latency: { p50: 4, p95: 9, p99: 12, max: 40, mean: 5 },
};
const config = { mode: "open" as const, op: "mixed" as const, rps: 60, durationSec: 2 };
const entry = (at: number): HistoryEntry => ({ at, op: "read", targetRps: 1, durationSec: 1, rps: 1, p50: 1, p99: 1, dropped: 0, errors: 0 });

test("entryOf builds the row: target from config, achieved and dropped from result, non-2xx as errors", () => {
  expect(entryOf(config, result, 123)).toEqual({
    at: 123, op: "mixed", targetRps: 60, durationSec: 2, rps: 50, p50: 4, p99: 12, dropped: 4, errors: 10,
  });
});

test("entryOf keeps null latency when nothing completed", () => {
  const e = entryOf(config, { ...result, latency: null }, 1);
  expect([e.p50, e.p99]).toEqual([null, null]);
});

test("add prepends newest first without mutating the input", () => {
  const before = [entry(1)];
  const after = historyReducer(before, { type: "add", entry: entry(2) });
  expect(after.map((e) => e.at)).toEqual([2, 1]);
  expect(before.map((e) => e.at)).toEqual([1]);
});

test("add caps the list at 50, dropping the oldest", () => {
  const full = Array.from({ length: 50 }, (_, i) => entry(50 - i));
  const after = historyReducer(full, { type: "add", entry: entry(51) });
  expect(after).toHaveLength(50);
  expect(after[0].at).toBe(51);
  expect(after.at(-1)?.at).toBe(2);
});

test("clear empties the list", () => {
  expect(historyReducer([entry(1), entry(2)], { type: "clear" })).toEqual([]);
});

test("historyKey is per project", () => {
  expect(historyKey("000")).toBe("loadlab.history.000");
  expect(historyKey("004")).toBe("loadlab.history.004");
});

test("loadHistory reads its project's key, and an empty list for missing, broken or throwing storage", () => {
  const store = (values: Record<string, string>) => ({ getItem: (k: string) => values[k] ?? null });
  const key = historyKey("000");
  expect(loadHistory(store({ [key]: JSON.stringify([entry(7)]) }), key)).toEqual([entry(7)]);
  expect(loadHistory(store({ [historyKey("001")]: JSON.stringify([entry(7)]) }), key)).toEqual([]);
  expect(loadHistory(store({ [key]: "{not json" }), key)).toEqual([]);
  expect(loadHistory(store({ [key]: '{"a":1}' }), key)).toEqual([]);
  expect(loadHistory({ getItem: () => { throw new Error("denied"); } }, key)).toEqual([]);
});

test("saveHistory writes under the given key and swallows storage failures", () => {
  const written: [string, string][] = [];
  saveHistory({ setItem: (k, v) => void written.push([k, v]) }, "k", [entry(3)]);
  expect(written).toEqual([["k", JSON.stringify([entry(3)])]]);
  expect(() => saveHistory({ setItem: () => { throw new Error("quota"); } }, "k", [])).not.toThrow();
});
