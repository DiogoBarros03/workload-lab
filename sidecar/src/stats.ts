import pg from "pg";
import { findApiPids, cpuNanos, rssBytes } from "./proc.ts";

export type Config = {
  procRoot: string;
  match: string;
  selfPid: number;
  limitCpuMilli: number;
  limitMemBytes: number;
};

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
};

function requiredInt(env: NodeJS.ProcessEnv, name: string) {
  const v = env[name];
  if (!v || !/^\d+$/.test(v)) throw new Error(`${name} must be a whole number, got ${v}`);
  return Number(v);
}

export function parseConfig(env: NodeJS.ProcessEnv, selfPid: number) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return {
    databaseUrl: env.DATABASE_URL,
    port: Number(env.PORT ?? 3001),
    procRoot: "/proc",
    match: env.API_MATCH ?? "src/server.ts",
    selfPid,
    limitCpuMilli: requiredInt(env, "LIMIT_CPU_MILLI"),
    limitMemBytes: requiredInt(env, "LIMIT_MEM_BYTES"),
  };
}

export const apiPids = (cfg: Config) => findApiPids(cfg.procRoot, cfg.match, cfg.selfPid);

// /proc sees usage only: throttling lives in the api's cgroup, invisible from here.
export function procStats(cfg: Config, now = Date.now()) {
  const pids = apiPids(cfg);
  const seen = pids.length > 0;
  return {
    cpuUsageUsec: seen ? Math.floor(cpuNanos(cfg.procRoot, pids) / 1000) : null,
    cpuQuotaCores: cfg.limitCpuMilli / 1000,
    nrThrottled: null,
    throttledUsec: null,
    memCurrentBytes: seen ? rssBytes(cfg.procRoot, pids) : null,
    memMaxBytes: cfg.limitMemBytes,
    sampledAtMs: now,
    observer: "sidecar" as const,
  };
}

// Same query as api/src/db.ts dbLoad: backends plus this database's counters.
const DB_LOAD_SQL = `
  SELECT
    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS "maxConnections",
    a.client::int AS "clientBackends", a.active::int AS "activeBackends", a.waiting::int AS "waitingBackends",
    d.xact_commit::float8 AS "xactCommit", d.xact_rollback::float8 AS "xactRollback",
    d.blks_hit::float8 AS "blksHit", d.blks_read::float8 AS "blksRead",
    d.tup_inserted::float8 AS "tupInserted", d.tup_updated::float8 AS "tupUpdated",
    d.tup_deleted::float8 AS "tupDeleted", d.tup_fetched::float8 AS "tupFetched"
  FROM pg_stat_database d,
    (SELECT count(*) AS client,
       count(*) FILTER (WHERE state = 'active' AND pid <> pg_backend_pid()) AS active,
       count(*) FILTER (WHERE state = 'active' AND wait_event IS NOT NULL AND pid <> pg_backend_pid()) AS waiting
     FROM pg_stat_activity WHERE backend_type = 'client backend') a
  WHERE d.datname = current_database()`;

export const dbLoader = (pool: pg.Pool) => async (): Promise<DbLoad> =>
  (await pool.query<DbLoad>(DB_LOAD_SQL)).rows[0];
