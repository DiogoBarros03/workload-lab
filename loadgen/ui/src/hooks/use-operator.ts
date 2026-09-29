import { useCallback, useEffect, useState } from "react";
import { clusterStates, clusterSummary, containerStates, type ClusterSummary, type OpStates } from "@/lib/operator";
import type { Project } from "@/lib/projects";
import type { Service } from "@/lib/status";

const OPERATOR = "http://127.0.0.1:3300";
const POLL_MS = 2000;
const BUSY_POLL_MS = 5000;
const TIMEOUT_MS = 1500;
// kind reads nodes and pods through kubectl, which is slower than compose.
const CLUSTER_TIMEOUT_MS = 4000;

export type ClusterJob = "up" | "apply" | "delete" | "down";
type Busy = "start" | "stop" | ClusterJob;
type Snapshot = { services: OpStates | null; cluster: ClusterSummary | null };
type OperatorState = Snapshot & { key: string | null; reachable: boolean; busy: Busy | null; error: string | null };
export type Operator = OperatorState & {
  start: (s: readonly Service[]) => Promise<void>;
  stop: (s: readonly Service[]) => Promise<void>;
  runJob: (job: ClusterJob) => Promise<void>;
};

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${OPERATOR}${path}`, init);
  const body = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `operator answered ${res.status}`);
  return body;
}

const post = (path: string, body: object) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// Compose projects read /containers; kind projects read their overlay from /cluster.
async function read(project: Project, signal?: AbortSignal): Promise<Snapshot> {
  const { runtime } = project;
  if (runtime.kind === "compose") return { services: containerStates(await call("/containers", { signal })), cluster: null };
  const body = await call("/cluster", { signal });
  return { services: clusterStates(body, runtime.overlay), cluster: clusterSummary(body) };
}

function overlayOf(project: Project): string {
  if (project.runtime.kind !== "kind") throw new Error(`${project.id} does not run on the cluster`);
  return project.runtime.overlay;
}

// Up and down act on the whole cluster; apply and delete on the project's overlay.
const clusterBody = (job: ClusterJob, project: Project) => (job === "up" || job === "down" ? {} : { overlay: overlayOf(project) });

const initial = (key: string | null): OperatorState =>
  ({ key, reachable: false, services: null, cluster: null, busy: null, error: null });

const signalFor = (project: Project, ctl: AbortController) =>
  AbortSignal.any([ctl.signal, AbortSignal.timeout(project.runtime.kind === "kind" ? CLUSTER_TIMEOUT_MS : TIMEOUT_MS)]);

// Polls while a project is open; compose pauses during a job, kind slows to 5 s.
function usePoll(project: Project | null, busy: Busy | null, set: (f: (s: OperatorState) => OperatorState) => void) {
  const paused = project === null || (busy !== null && project.runtime.kind === "compose");
  const every = busy === null ? POLL_MS : BUSY_POLL_MS;
  useEffect(() => {
    if (paused) return;
    const ctl = new AbortController();
    const poll = async () => {
      try {
        const next = await read(project, signalFor(project, ctl));
        set((s) => ({ ...s, ...next, reachable: true }));
      } catch {
        // Unreachable is a normal state: the operator is only started by hand.
        if (!ctl.signal.aborted) set((s) => ({ ...s, reachable: false, services: null, cluster: null }));
      }
    };
    void poll();
    const id = setInterval(poll, every);
    return () => { clearInterval(id); ctl.abort(); };
  }, [project, paused, every, set]);
}

export function useOperator(project: Project | null): Operator {
  const key = project?.id ?? null;
  const [kept, setState] = useState<OperatorState>(() => initial(key));
  const state = kept.key === key ? kept : initial(key);
  // A new project starts unknown, never with the last project's containers.
  if (kept !== state) setState(state);
  usePoll(project, state.busy, setState);

  const act = useCallback(async (busy: Busy, job: () => Promise<Snapshot>) => {
    setState((s) => ({ ...s, busy, error: null }));
    try {
      const next = await job();
      setState((s) => ({ ...s, ...next, busy: null, reachable: true }));
    } catch (err) {
      setState((s) => ({ ...s, busy: null, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);
  const start = useCallback((s: readonly Service[]) =>
    act("start", async () => ({ services: containerStates(await post("/containers/start", { services: s })), cluster: null })), [act]);
  const stop = useCallback((s: readonly Service[]) =>
    act("stop", async () => ({ services: containerStates(await post("/containers/stop", { services: s })), cluster: null })), [act]);
  const runJob = useCallback(async (job: ClusterJob) => {
    if (project === null) throw new Error("no project is open");
    await act(job, async () => { await post(`/cluster/${job}`, clusterBody(job, project)); return read(project); });
  }, [act, project]);
  return { ...state, start, stop, runJob };
}
