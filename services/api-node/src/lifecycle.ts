// Shutdown is a state machine, not a sleep: mark not-ready, keep answering probes, drain, exit.

export type Phase = "starting" | "ok" | "shutting_down";

// Probes keep answering during the drain; /readyz is how a load balancer learns to stop sending.
const PROBES = new Set(["/healthz", "/readyz", "/metrics"]);

export function readyState(phase: Phase): { code: number; status: Phase } {
  return phase === "ok" ? { code: 200, status: "ok" } : { code: 503, status: phase };
}

export function isRefused(phase: Phase, url: string): boolean {
  return phase === "shutting_down" && !PROBES.has(url.split("?")[0]);
}

export type Drain = {
  enter: () => void;
  leave: () => void;
  inflight: () => number;
  idle: () => Promise<void>;
};

export function createDrain(): Drain {
  let inflight = 0;
  let waiters: (() => void)[] = [];
  const release = () => {
    for (const waiter of waiters) waiter();
    waiters = [];
  };
  return {
    enter: () => {
      inflight += 1;
    },
    leave: () => {
      inflight -= 1;
      if (inflight <= 0) release();
    },
    inflight: () => inflight,
    idle: () => (inflight <= 0 ? Promise.resolve() : new Promise<void>((r) => waiters.push(r))),
  };
}

export type ShutdownDeps = {
  graceMs: number;
  idle: () => Promise<void>;
  close: () => Promise<void>;
  exit: (code: number) => void;
};

// Exit 1 on the deadline: a forced shutdown dropped requests and should not look clean.
export async function runShutdown(deps: ShutdownDeps): Promise<void> {
  const forced = setTimeout(() => deps.exit(1), deps.graceMs);
  try {
    await deps.idle();
    await deps.close();
    deps.exit(0);
  } catch {
    deps.exit(1);
  } finally {
    clearTimeout(forced);
  }
}
