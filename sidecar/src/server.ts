import Fastify from "fastify";
import pg from "pg";
import { type Config, type DbLoad, apiPids, dbLoader, parseConfig, procStats } from "./stats.ts";

const works = (p: Promise<unknown>) => p.then(() => true, () => false);

export function buildApp(cfg: Config, dbLoad: () => Promise<DbLoad>) {
  const app = Fastify({ logger: process.env.LOG_LEVEL !== "silent" });

  app.get("/health", async (_req, reply) => {
    const api = apiPids(cfg).length > 0;
    const db = await works(dbLoad());
    const body = { api: api ? "ok" : "not found", db: db ? "ok" : "unreachable" };
    if (api && db) return { status: "ok", ...body };
    return reply.code(503).send({ status: "unhealthy", ...body });
  });

  // pool is null: the api's pg pool lives in its heap, invisible to another process.
  app.get("/stats", async (req) => {
    const proc = procStats(cfg);
    try {
      return { ...proc, db: { ...(await dbLoad()), sampledAtMs: Date.now() }, pool: null };
    } catch (err) {
      req.log.warn(err);
      return { ...proc, db: null, pool: null };
    }
  });

  return app;
}

if (import.meta.main) {
  const { databaseUrl, port, ...cfg } = parseConfig(process.env, process.pid);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 1000 });
  const app = buildApp(cfg, dbLoader(pool));
  pool.on("error", (err) => app.log.warn({ err }, "idle database client lost"));
  const shutdown = async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  await app.listen({ port, host: "0.0.0.0" });
}
