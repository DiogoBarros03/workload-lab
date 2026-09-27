import { fmtInt } from "./format";
import type { ArchEdge } from "./learning";
import type { RunState } from "./run";
import { loadTone, SERVICES, type Container, type CpuSample, type DbSample, type Health, type LoadTone, type Service } from "./status";

export type LiveStatus = { containers: Container[] | null; apiCpu: CpuSample[]; dbLoad: DbSample[]; health: Record<Service, Health> };
export type EdgeFlow = { width: number; gap: number; durationSec: number; active: boolean };
export type NodeReadout = {
  busy: number | null; busyLabel: string; p99: number | null; waiting: number | null; waitingLabel: string;
  errPerSec: number | null; tone: LoadTone; health: Health; sparkline: number[];
};
export type EdgeReadout = { rps: number; label: string; danger: boolean };

const WINDOW_SEC = 0.5;
const LOADGEN_CAP = 10_000; // in-flight requests treated as a full loadgen
const STALE_MS = 3000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ratio = (part: number | null | undefined, whole: number | null | undefined) =>
  part == null || !whole ? null : part / whole;

// Dash width, spacing and speed on a log scale of the rate, as breakscale.tech draws them.
export function edgeFlow(rps: number): EdgeFlow {
  if (!Number.isFinite(rps) || rps < 0) throw new Error(`edgeFlow: invalid rate ${rps}`);
  const l = Math.log10(1 + rps);
  return {
    width: clamp(1 + l * 0.85, 1, 4.5), gap: clamp(20 - l * 4, 7, 20),
    durationSec: clamp(3.2 / Math.log10(10 + rps), 0.35, 2.4), active: rps > 0.05,
  };
}

// Nearest of 1, 2, 5 × 10^k, so animation parameters change only at steps.
export function bucketRps(rps: number): number {
  if (!Number.isFinite(rps) || rps < 0) throw new Error(`bucketRps: invalid rate ${rps}`);
  if (rps === 0) return 0;
  const decade = 10 ** Math.floor(Math.log10(rps));
  const steps = [1, 2, 5, 10].map((m) => m * decade);
  return steps.reduce((best, c) => (Math.abs(c - rps) < Math.abs(best - rps) ? c : best));
}

const rowOf = (s: LiveStatus, service: Service) => s.containers?.find((c) => c.service === service);

function normalise(values: number[]): number[] {
  const max = Math.max(...values);
  return max > 0 ? values.map((v) => v / max) : values;
}

// Last 60 s of 500 ms points, every other one so the newest is kept.
const lastMinute = <T,>(points: T[]) => points.slice(-120).filter((_, i, a) => (a.length - 1 - i) % 2 === 0);

type Parts = Pick<NodeReadout, "busy" | "p99" | "waiting" | "waitingLabel" | "errPerSec" | "sparkline">;

function apiParts(run: RunState, s: LiveStatus): Parts {
  const c = rowOf(s, "api");
  const ratios = [ratio(c?.cpuCores, c?.cpuQuotaCores), ratio(c?.memBytes, c?.memMaxBytes)].filter((r) => r !== null);
  const w = run.progress?.window;
  return {
    busy: ratios.length ? Math.max(...ratios) : null, p99: w?.p99 ?? null, waiting: run.progress?.inFlight ?? null,
    waitingLabel: "In Flight", errPerSec: w ? w.errors / WINDOW_SEC : null,
    sparkline: s.apiCpu.flatMap((x) => (x.quota ? [x.cores / x.quota] : [])),
  };
}

function dbParts(s: LiveStatus): Parts {
  const c = rowOf(s, "db");
  return {
    busy: ratio(c?.poolBusy, c?.poolMax), p99: null, waiting: c?.poolWaiting ?? null, waitingLabel: "Waiting", errPerSec: null,
    sparkline: normalise(s.dbLoad.flatMap((x) => (x.poolWaiting === null ? [] : [x.poolWaiting]))),
  };
}

function loadgenParts(run: RunState): Parts {
  const p = run.progress;
  return {
    busy: p ? p.inFlight / LOADGEN_CAP : null, p99: null, waiting: p?.dropped ?? null, waitingLabel: "Dropped", errPerSec: null,
    sparkline: lastMinute(run.series).flatMap((x) => (x.targetRps ? [x.rps / x.targetRps] : [])),
  };
}

const UNKNOWN: Parts = { busy: null, p99: null, waiting: null, waitingLabel: "Waiting", errPerSec: null, sparkline: [] };

function partsOf(id: string, run: RunState, s: LiveStatus): Parts {
  if (id === "api") return apiParts(run, s);
  if (id === "db") return dbParts(s);
  return id === "loadgen" ? loadgenParts(run) : UNKNOWN;
}

const isService = (id: string): id is Service => (SERVICES as readonly string[]).includes(id);

// One node's live numbers; nodes outside the lab's three services read as unknown.
export function nodeReadout(id: string, run: RunState, s: LiveStatus): NodeReadout {
  const parts = partsOf(id, run, s);
  const health = isService(id) ? s.health[id] : "unknown";
  const failing = health === "down" || (parts.errPerSec ?? 0) > 0;
  return {
    ...parts, busyLabel: parts.busy === null ? "—" : `${Math.round(parts.busy * 100)} %`,
    tone: failing ? "hot" : loadTone(parts.busy), health,
  };
}

// Into the db the rate is commits when known; elsewhere it is the run's window rate.
export function edgeReadout(edge: ArchEdge, run: RunState, s: LiveStatus): EdgeReadout {
  const windowRps = run.progress?.window?.rps ?? 0;
  const rps = edge.to === "db" ? (rowOf(s, "db")?.commitsPerSec ?? windowRps) : windowRps;
  const target = nodeReadout(edge.to, run, s);
  return { rps, label: `${fmtInt(rps)}/s`, danger: target.tone === "hot" || target.health === "down" || target.health === "slow" };
}

// Traffic only flows while a run is live and its progress is fresh.
export const idle = (run: RunState, lastProgressAt: number | null, now: number) =>
  run.phase !== "running" || run.progress === null || lastProgressAt === null || now - lastProgressAt > STALE_MS;
