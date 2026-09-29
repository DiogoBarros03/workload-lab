import { useCallback, useEffect, useState } from "react";
import { clusterStates, clusterSummary, containerStates, controllable, type ClusterSummary, type OpStates } from "@/lib/operator";
import { PROJECTS, type Project } from "@/lib/projects";
import { activeRuntimes, phaseOf, planEnsure, type Active, type Plan, type Step } from "@/lib/runtime";
import { deriveStatus, statusUrl, type Container, type Service } from "@/lib/status";

const OPERATOR = "http://127.0.0.1:3300";
const POLL_MS = 2000;
const BUSY_POLL_MS = 5000;
// kind reads nodes and pods through kubectl, which is slower than compose.
const TIMEOUT_MS = 4000;
const HEALTH_TIMEOUT_MS = 180_000;

export type ClusterJob = "up" | "apply" | "delete" | "down";
type Busy = "start" | "stop" | "wait" | ClusterJob;
type Snapshot = { services: OpStates | null; cluster: ClusterSummary | null; active: Active[] };
type OperatorState = Snapshot & { key: string | null; reachable: boolean; busy: Busy | null; phase: string | null; error: string | null };
// Ready: the runtime is up; failed: the error is in state; else the project to stop first.
export type Prepared = "ready" | "failed" | Active;
export type Operator = OperatorState & {
  start: (s: readonly Service[]) => Promise<void>;
  stop: (s: readonly Service[]) => Promise<void>;
  runJob: (job: ClusterJob) => Promise<void>;
  prepare: (confirmed: boolean) => Promise<Prepared>;
};

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${OPERATOR}${path}`, init);
  const body = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `operator answered ${res.status}`);
  return body;
}

const post = (path: string, body: object) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// Reads compose and the cluster together, so every project's runtime is known.
async function read(project: Project, signal?: AbortSignal): Promise<Snapshot> {
  const [compose, raw] = await Promise.all([call("/containers", { signal }), call("/cluster", { signal })]);
  const containers = containerStates(compose);
  const cluster = clusterSummary(raw);
  const { runtime } = project;
  const services = runtime.kind === "compose" ? containers : clusterStates(raw, runtime.overlay);
  return { services, cluster, active: activeRuntimes(containers, cluster, PROJECTS) };
}

function overlayOf(project: Project): string {
  if (project.runtime.kind !== "kind") throw new Error(`${project.id} does not run on the cluster`);
  return project.runtime.overlay;
}

// Up and down act on the whole cluster; apply and delete on the project's overlay.
const clusterBody = (job: ClusterJob, project: Project) => (job === "up" || job === "down" ? {} : { overlay: overlayOf(project) });

const initial = (key: string | null): OperatorState =>
  ({ key, reachable: false, services: null, cluster: null, active: [], busy: null, phase: null, error: null });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function healthy(target: string): Promise<boolean> {
  const res = await fetch(statusUrl(target));
  if (!res.ok) return false;
  const { health } = deriveStatus(((await res.json()) as { containers: Container[] }).containers, null);
  return health.api === "up" && health.db === "up";
}

// Polls loadgen's /status until api and db answer up.
async function waitHealthy(target: string) {
  for (const end = Date.now() + HEALTH_TIMEOUT_MS; Date.now() < end; await sleep(POLL_MS)) {
    if (await healthy(target)) return;
  }
  throw new Error(`api and db were not up after ${HEALTH_TIMEOUT_MS / 1000} s`);
}

const stopOther = (other: Active) =>
  other.runtime.kind === "compose"
    ? post("/containers/stop", { services: other.runtime.services.filter((s) => s !== "loadgen") })
    : post("/cluster/delete", { overlay: other.runtime.overlay });

function runStep(step: Step, project: Project): Promise<unknown> {
  if (step.job === "stop") return stopOther(step.other);
  if (step.job === "start") return post("/containers/start", { services: controllable(project) });
  if (step.job === "wait") return waitHealthy(project.target);
  return post(`/cluster/${step.job}`, clusterBody(step.job, project));
}

const busyOf = (step: Step): Busy => (step.job !== "stop" ? step.job : step.other.runtime.kind === "compose" ? "stop" : "delete");

// Polls while a project is open; compose jobs pause it, other jobs slow it to 5 s.
function usePoll(project: Project | null, busy: Busy | null, set: (f: (s: OperatorState) => OperatorState) => void) {
  const paused = project === null || busy === "start" || busy === "stop";
  const every = busy === null ? POLL_MS : BUSY_POLL_MS;
  useEffect(() => {
    if (paused) return;
    const ctl = new AbortController();
    const poll = async () => {
      try {
        const next = await read(project, AbortSignal.any([ctl.signal, AbortSignal.timeout(TIMEOUT_MS)]));
        set((s) => ({ ...s, ...next, reachable: true }));
      } catch {
        // Unreachable is a normal state: the operator is only started by hand.
        if (!ctl.signal.aborted) set((s) => ({ ...s, reachable: false, services: null, cluster: null, active: [] }));
      }
    };
    void poll();
    const id = setInterval(poll, every);
    return () => { clearInterval(id); ctl.abort(); };
  }, [project, paused, every, set]);
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function useOperator(project: Project | null): Operator {
  const key = project?.id ?? null;
  const [kept, setState] = useState<OperatorState>(() => initial(key));
  const state = kept.key === key ? kept : initial(key);
  // A new project starts unknown, never with the last project's containers.
  if (kept !== state) setState(state);
  usePoll(project, state.busy, setState);

  // Runs the steps in order, showing each one, then rereads the operator.
  const act = useCallback(async (steps: { busy: Busy; phase: string | null; run: () => Promise<unknown> }[]) => {
    if (project === null) throw new Error("no project is open");
    setState((s) => ({ ...s, error: null }));
    try {
      for (const { busy, phase, run } of steps) {
        setState((s) => ({ ...s, busy, phase }));
        await run();
      }
      const next = await read(project);
      setState((s) => ({ ...s, ...next, busy: null, phase: null, reachable: true }));
      return true;
    } catch (err) {
      setState((s) => ({ ...s, busy: null, phase: null, error: messageOf(err) }));
      return false;
    }
  }, [project]);
  const start = useCallback(async (s: readonly Service[]) =>
    void await act([{ busy: "start", phase: null, run: () => post("/containers/start", { services: s }) }]), [act]);
  const stop = useCallback(async (s: readonly Service[]) =>
    void await act([{ busy: "stop", phase: null, run: () => post("/containers/stop", { services: s }) }]), [act]);
  const runJob = useCallback(async (job: ClusterJob) => {
    if (project === null) throw new Error("no project is open");
    await act([{ busy: job, phase: null, run: () => post(`/cluster/${job}`, clusterBody(job, project)) }]);
  }, [act, project]);
  const prepare = async (confirmed: boolean): Promise<Prepared> => {
    if (project === null) throw new Error("no project is open");
    let plan: Plan;
    try {
      plan = planEnsure(project, state.active, state.cluster, confirmed);
    } catch (err) {
      setState((s) => ({ ...s, error: messageOf(err) }));
      return "failed";
    }
    if ("confirm" in plan) return plan.confirm;
    const ok = await act(plan.steps.map((step) => ({ busy: busyOf(step), phase: phaseOf(step), run: () => runStep(step, project) })));
    return ok ? "ready" : "failed";
  };
  return { ...state, start, stop, runJob, prepare };
}
