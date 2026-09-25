import type { Cgroup } from "./cgroup.ts";

export type DbLoad = {
  maxConnections: number;
  clientBackends: number;
  activeBackends: number;
  waitingBackends: number;
  xactCommit: number;
  xactRollback: number;
  blksHit: number;
  blksRead: number;
  tupInserted: number;
  tupUpdated: number;
  tupDeleted: number;
  tupFetched: number;
  sampledAtMs: number;
};
export type PoolStats = { max: number; total: number; idle: number; waiting: number };
export type ApiStats = Cgroup & { db: DbLoad | null; pool: PoolStats };

export type Prev = {
  readonly api: ApiStats | null;
  readonly loadgen: Cgroup | null;
  readonly lastApiOkAt: number | null;
};

export type ProbeFailure = { kind: "timeout" | "refused" | "dns" | "http"; detail: string };
export type ApiProbe = { ok: true; health: number; stats: ApiStats } | ({ ok: false } & ProbeFailure);

export type State = "up" | "slow" | "down";
type Health = { state: State; reason: string | null };

const NET_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET"]);

// Sorts a probe rejection: lookup failed, timed out, never connected, or anything else.
export function classifyProbeError(err: unknown): ProbeFailure {
  if (!(err instanceof Error)) return { kind: "http", detail: String(err) };
  const own = err as Error & { code?: unknown; syscall?: unknown };
  if (own.syscall === "getaddrinfo") return { kind: "dns", detail: String(own.code) };
  if (err.name === "TimeoutError" || err.name === "AbortError") return { kind: "timeout", detail: err.name };
  const code = (err.cause as { code?: unknown } | undefined)?.code;
  if (typeof code === "string" && NET_CODES.has(code)) return { kind: "refused", detail: code };
  return { kind: "http", detail: err.message };
}

type DbFields = {
  connUsed: number | null;
  connMax: number | null;
  activeBackends: number | null;
  waitingBackends: number | null;
  poolBusy: number | null;
  poolMax: number | null;
  poolWaiting: number | null;
  commitsPerSec: number | null;
  rowsPerSec: number | null;
  cacheHitRatio: number | null;
};

// Only the db row carries the db fields.
export type Container = {
  service: string;
  state: State;
  up: boolean;
  reason: string | null;
  cpuCores: number | null;
  cpuQuotaCores: number | null;
  nrThrottled: number | null;
  memBytes: number | null;
  memMaxBytes: number | null;
} & Partial<DbFields>;

type Input = { apiProbe: ApiProbe; selfStats: Cgroup; prev: Prev; nowMs: number };

// Negative usage delta means the container restarted between samples.
function cpuCores(prev: Cgroup | null, cur: Cgroup | null) {
  if (prev?.cpuUsageUsec == null || cur?.cpuUsageUsec == null) return null;
  const wallUsec = (cur.sampledAtMs - prev.sampledAtMs) * 1000;
  const used = cur.cpuUsageUsec - prev.cpuUsageUsec;
  return wallUsec > 0 && used >= 0 ? used / wallUsec : null;
}

// Null stats are a valid state: down, or a service with no HTTP (db).
const row = (service: string, h: Health, cur: Cgroup | null, prev: Cgroup | null): Container => ({
  service,
  ...h,
  up: h.state !== "down",
  cpuCores: cpuCores(prev, cur),
  cpuQuotaCores: cur?.cpuQuotaCores ?? null,
  nrThrottled: cur?.nrThrottled ?? null,
  memBytes: cur?.memCurrentBytes ?? null,
  memMaxBytes: cur?.memMaxBytes ?? null,
});

const NO_DB: DbFields = Object.freeze({
  connUsed: null, connMax: null, activeBackends: null, waitingBackends: null, poolBusy: null,
  poolMax: null, poolWaiting: null, commitsPerSec: null, rowsPerSec: null, cacheHitRatio: null,
});

const rows = (d: DbLoad) => d.tupInserted + d.tupUpdated + d.tupDeleted + d.tupFetched;

// A negative delta means pg_stat_reset or a db restart: no rate then.
function deltas(prev: DbLoad | null, cur: DbLoad) {
  if (!prev || cur.sampledAtMs <= prev.sampledAtMs) return null;
  const d = {
    commits: cur.xactCommit - prev.xactCommit,
    rows: rows(cur) - rows(prev),
    hit: cur.blksHit - prev.blksHit,
    read: cur.blksRead - prev.blksRead,
  };
  if (Object.values(d).some((v) => v < 0)) return null;
  return { ...d, sec: (cur.sampledAtMs - prev.sampledAtMs) / 1000 };
}

function dbFields(cur: ApiStats | null, prev: DbLoad | null): DbFields {
  if (!cur?.db) return NO_DB;
  const d = deltas(prev, cur.db);
  const blocks = d ? d.hit + d.read : 0;
  return {
    connUsed: cur.db.clientBackends,
    connMax: cur.db.maxConnections,
    activeBackends: cur.db.activeBackends,
    waitingBackends: cur.db.waitingBackends,
    poolBusy: cur.pool.total - cur.pool.idle,
    poolMax: cur.pool.max,
    poolWaiting: cur.pool.waiting,
    commitsPerSec: d && d.commits / d.sec,
    rowsPerSec: d && d.rows / d.sec,
    cacheHitRatio: d && blocks > 0 ? d.hit / blocks : null,
  };
}

const UP: Health = Object.freeze({ state: "up", reason: null });
const SLOW_WINDOW_MS = 30_000;

const DOWN_REASON: Record<ProbeFailure["kind"], string> = {
  timeout: "The api has not answered for 30 s or more",
  refused: "The api refused the connection or its name did not resolve",
  dns: "The api's hostname does not resolve",
  http: "The api answered with an error",
};

// A timeout is slow only while the last success is under 30 s old.
function apiHealth(probe: ApiProbe, prev: Prev, nowMs: number): Health {
  if (probe.ok) return UP;
  const recent = prev.lastApiOkAt !== null && nowMs - prev.lastApiOkAt < SLOW_WINDOW_MS;
  if (probe.kind === "timeout" && recent) {
    return { state: "slow", reason: "The api did not answer within 3 s but answered in the last 30 s." };
  }
  return { state: "down", reason: `${DOWN_REASON[probe.kind]} (${probe.detail}).` };
}

function dbHealth(api: Health, probe: ApiProbe): Health {
  if (api.state === "down") return { state: "down", reason: "The api is unreachable, so the database cannot be checked." };
  if (!probe.ok) return { state: "slow", reason: "The api timed out, so the database was not checked." };
  if (probe.health !== 200) return { state: "down", reason: "The api reports the database unreachable." };
  return UP;
}

export function buildStatus({ apiProbe, selfStats, prev, nowMs }: Input) {
  const apiStats = apiProbe.ok ? apiProbe.stats : null;
  const api = apiHealth(apiProbe, prev, nowMs);
  const containers = [
    row("api", api, apiStats, prev.api),
    { ...row("db", dbHealth(api, apiProbe), null, null), ...dbFields(apiStats, prev.api?.db ?? null) },
    row("loadgen", UP, selfStats, prev.loadgen),
  ];
  return { containers: containers.toSorted((a, b) => a.service.localeCompare(b.service)) };
}

// The next /status call's previous sample; a failed probe keeps the old success time.
export const nextPrev = ({ apiProbe, selfStats, prev, nowMs }: Input): Prev => ({
  api: apiProbe.ok ? apiProbe.stats : null,
  loadgen: selfStats,
  lastApiOkAt: apiProbe.ok ? nowMs : prev.lastApiOkAt,
});
