import { useCallback, useEffect, useReducer, useRef } from "react";
import { initialRun, runReducer, type Progress, type Result, type RunAction, type RunConfig } from "@/lib/run";
import { parseSse, type SseEvent } from "@/lib/sse";

// Unknown event names are skipped so the server may add new ones.
function toAction(e: SseEvent): RunAction | null {
  if (e.event === "progress") return { type: "progress", progress: e.data as Progress };
  if (e.event === "result") return { type: "result", result: e.data as Result };
  if (e.event === "error") return { type: "error", message: (e.data as { error: string }).error };
  return null;
}

async function openRun(config: RunConfig, signal: AbortSignal) {
  const res = await fetch("/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
    signal,
  });
  if (res.ok && res.body) return res.body.pipeThrough(new TextDecoderStream()).getReader();
  const body = (await res.json()) as { error?: string; message?: string };
  throw new Error(body.error ?? body.message ?? `run answered ${res.status}`);
}

async function consume(reader: ReadableStreamDefaultReader<string>, dispatch: (a: RunAction) => void) {
  let rest = "";
  let ended = false;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    const parsed = parseSse(rest + chunk.value);
    rest = parsed.rest;
    for (const action of parsed.events.map(toAction)) {
      if (!action) continue;
      dispatch(action);
      ended ||= action.type !== "progress";
    }
  }
  if (!ended) throw new Error("the run ended without a result");
}

export function useRun(onResult: (config: RunConfig, result: Result) => void) {
  const [state, dispatch] = useReducer(runReducer, initialRun);
  const ctl = useRef<AbortController | null>(null);
  // Leaving the page cancels its run on the server too.
  useEffect(() => () => ctl.current?.abort(), []);

  const start = useCallback(async (config: RunConfig) => {
    const abort = new AbortController();
    ctl.current = abort;
    dispatch({ type: "start", config });
    const forward = (a: RunAction) => {
      dispatch(a);
      if (a.type === "result") onResult(config, a.result);
    };
    try {
      await consume(await openRun(config, abort.signal), forward);
    } catch (err) {
      // Stop already moved the run to idle; the abort error is expected.
      if (!abort.signal.aborted) dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [onResult]);

  const stop = useCallback(() => {
    ctl.current?.abort();
    dispatch({ type: "stop" });
  }, []);

  return { state, start, stop };
}
