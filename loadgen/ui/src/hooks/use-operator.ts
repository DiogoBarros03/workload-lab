import { useCallback, useEffect, useState } from "react";
import { containerStates, type OpStates } from "@/lib/operator";
import type { Service } from "@/lib/status";

const OPERATOR = "http://127.0.0.1:3300";
const POLL_MS = 2000;
const TIMEOUT_MS = 1500;

type Busy = "start" | "stop";
type OperatorState = { reachable: boolean; services: OpStates | null; busy: Busy | null; error: string | null };
export type Operator = OperatorState & { start: (s: readonly Service[]) => Promise<void>; stop: (s: readonly Service[]) => Promise<void> };

async function call(path: string, init?: RequestInit): Promise<OpStates> {
  const res = await fetch(`${OPERATOR}${path}`, init);
  const body = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `operator answered ${res.status}`);
  return containerStates(body);
}

const post = (busy: Busy, services: readonly Service[]) => call(`/containers/${busy}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ services }),
});

// Polls the host operator while enabled; paused during a start or stop.
export function useOperator(enabled: boolean): Operator {
  const [state, setState] = useState<OperatorState>({ reachable: false, services: null, busy: null, error: null });
  const idle = state.busy === null;
  useEffect(() => {
    if (!enabled || !idle) return;
    const ctl = new AbortController();
    const poll = async () => {
      try {
        const services = await call("/containers", { signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(TIMEOUT_MS)]) });
        setState((s) => ({ ...s, reachable: true, services }));
      } catch {
        // Unreachable is a normal state: the operator is only started by hand.
        if (!ctl.signal.aborted) setState((s) => ({ ...s, reachable: false, services: null }));
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => { clearInterval(id); ctl.abort(); };
  }, [enabled, idle]);

  const act = useCallback(async (busy: Busy, services: readonly Service[]) => {
    setState((s) => ({ ...s, busy, error: null }));
    try {
      const next = await post(busy, services);
      setState((s) => ({ ...s, busy: null, reachable: true, services: next }));
    } catch (err) {
      setState((s) => ({ ...s, busy: null, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);
  const start = useCallback((s: readonly Service[]) => act("start", s), [act]);
  const stop = useCallback((s: readonly Service[]) => act("stop", s), [act]);
  return { ...state, start, stop };
}
