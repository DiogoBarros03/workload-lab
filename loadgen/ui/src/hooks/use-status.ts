import { useEffect, useState } from "react";
import { deriveStatus, isOutage, nextSince, type Container, type CpuSample, type DbSample, type StatusView } from "@/lib/status";

export type { Container, CpuSample, DbSample } from "@/lib/status";

type Raw = {
  containers: Container[] | null; error: string | null; apiCpu: CpuSample[]; dbLoad: DbSample[]; since: number | null; at: number;
};
export type StatusState = Raw & { view: StatusView };

const POLL_MS = 2000;
// 30 polls at 2 s: the last 60 s.
export const CPU_POINTS = 30;

function withCpu(history: CpuSample[], containers: Container[]): CpuSample[] {
  const api = containers.find((c) => c.service === "api");
  if (typeof api?.cpuCores !== "number") return history;
  const sample = { at: Date.now(), cores: api.cpuCores, quota: api.cpuQuotaCores, nrThrottled: api.nrThrottled };
  return [...history, sample].slice(-CPU_POINTS);
}

// Null db fields are kept: the chart shows them as gaps.
function withDb(history: DbSample[], containers: Container[]): DbSample[] {
  const db = containers.find((c) => c.service === "db");
  if (!db) return history;
  const sample = { at: Date.now(), poolWaiting: db.poolWaiting ?? null, commitsPerSec: db.commitsPerSec ?? null };
  return [...history, sample].slice(-CPU_POINTS);
}

// A failed poll drops the last payload: stale rows would read as healthy.
function settle(s: Raw, containers: Container[] | null, error: string | null): Raw {
  const at = Date.now();
  const since = nextSince(s.since, isOutage(deriveStatus(containers, error)), at);
  const apiCpu = containers ? withCpu(s.apiCpu, containers) : s.apiCpu;
  const dbLoad = containers ? withDb(s.dbLoad, containers) : s.dbLoad;
  return { containers, error, apiCpu, dbLoad, since, at };
}

export function useStatus(): StatusState {
  const [state, setState] = useState<Raw>({ containers: null, error: null, apiCpu: [], dbLoad: [], since: null, at: 0 });
  useEffect(() => {
    const ctl = new AbortController();
    const poll = async () => {
      try {
        const res = await fetch("/status", { signal: ctl.signal });
        if (!res.ok) throw new Error(`status answered ${res.status}`);
        const { containers } = (await res.json()) as { containers: Container[] };
        setState((s) => settle(s, containers, null));
      } catch (err) {
        if (!ctl.signal.aborted) setState((s) => settle(s, null, String(err)));
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      clearInterval(id);
      ctl.abort();
    };
  }, []);
  return { ...state, view: deriveStatus(state.containers, state.error) };
}
