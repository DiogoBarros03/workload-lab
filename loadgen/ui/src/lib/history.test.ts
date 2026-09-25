import { expect, test } from "vitest";
import { entryOf, historyReducer, loadHistory, type HistoryEntry } from "./history";
import type { Result } from "./run";

const result: Result = {
  requests: 100, durationMs: 2000, rps: 50, errors: 2,
  statusCounts: { "200": 90, "409": 5, "500": 3 },
  latency: { p50: 4, p95: 9, p99: 12, max: 40, mean: 5 },
};
const entry = (at: number): HistoryEntry => ({ at, op: "read", requests: 1, concurrency: 1, rps: 1, p50: 1, p99: 1, errors: 0 });

test("entryOf counts network errors and non-2xx as errors", () => {
  expect(entryOf({ op: "mixed", requests: 100, concurrency: 7 }, result, 123)).toEqual({
    at: 123, op: "mixed", requests: 100, concurrency: 7, rps: 50, p50: 4, p99: 12, errors: 10,
  });
});

test("entryOf keeps null latency when nothing completed", () => {
  const e = entryOf({ op: "read", requests: 1, concurrency: 1 }, { ...result, latency: null }, 1);
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

test("loadHistory returns stored entries, and an empty list for missing, broken or throwing storage", () => {
  const store = (value: string | null) => ({ getItem: () => value });
  expect(loadHistory(store(JSON.stringify([entry(7)])))).toEqual([entry(7)]);
  expect(loadHistory(store(null))).toEqual([]);
  expect(loadHistory(store("{not json"))).toEqual([]);
  expect(loadHistory(store('{"a":1}'))).toEqual([]);
  expect(loadHistory({ getItem: () => { throw new Error("denied"); } })).toEqual([]);
});
