import type { Op, Result, RunConfig } from "./run";

export type HistoryEntry = {
  at: number;
  op: Op;
  requests: number;
  concurrency: number;
  rps: number;
  p50: number | null;
  p99: number | null;
  errors: number;
};

export type HistoryAction = { type: "add"; entry: HistoryEntry } | { type: "clear" };

export const HISTORY_CAP = 50;
export const HISTORY_KEY = "loadlab.history";

// Errors here mean anything not 2xx, network failures included.
export function entryOf(config: RunConfig, r: Result, at: number): HistoryEntry {
  const failed = Object.entries(r.statusCounts)
    .filter(([code]) => !code.startsWith("2"))
    .reduce((n, [, count]) => n + count, r.errors);
  return { at, ...config, rps: r.rps, p50: r.latency?.p50 ?? null, p99: r.latency?.p99 ?? null, errors: failed };
}

export function historyReducer(list: HistoryEntry[], a: HistoryAction): HistoryEntry[] {
  if (a.type === "clear") return [];
  return [a.entry, ...list].slice(0, HISTORY_CAP);
}

// Storage is a convenience: private mode or bad data must not break the page.
export function loadHistory(storage: Pick<Storage, "getItem">): HistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_CAP) : [];
  } catch {
    return [];
  }
}

export function saveHistory(storage: Pick<Storage, "setItem">, list: HistoryEntry[]) {
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // Quota or disabled storage: history stays in memory for this tab.
  }
}
