import { useEffect, useState } from "react";

export type Container = {
  service: "api" | "db" | "loadgen";
  up: boolean;
  cpuCores: number | null;
  cpuQuotaCores: number | null;
  nrThrottled: number | null;
  memBytes: number | null;
  memMaxBytes: number | null;
};

export type CpuSample = { at: number; cores: number };

export type StatusState = { containers: Container[] | null; error: string | null; apiCpu: CpuSample[] };

const POLL_MS = 2000;
export const CPU_POINTS = 60;

function withCpu(history: CpuSample[], containers: Container[]): CpuSample[] {
  const cores = containers.find((c) => c.service === "api")?.cpuCores;
  if (typeof cores !== "number") return history;
  return [...history, { at: Date.now(), cores }].slice(-CPU_POINTS);
}

export function useStatus(): StatusState {
  const [state, setState] = useState<StatusState>({ containers: null, error: null, apiCpu: [] });
  useEffect(() => {
    const ctl = new AbortController();
    const poll = async () => {
      try {
        const res = await fetch("/status", { signal: ctl.signal });
        if (!res.ok) throw new Error(`status answered ${res.status}`);
        const { containers } = (await res.json()) as { containers: Container[] };
        setState((s) => ({ containers, error: null, apiCpu: withCpu(s.apiCpu, containers) }));
      } catch (err) {
        if (!ctl.signal.aborted) setState((s) => ({ ...s, error: String(err) }));
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      clearInterval(id);
      ctl.abort();
    };
  }, []);
  return state;
}
