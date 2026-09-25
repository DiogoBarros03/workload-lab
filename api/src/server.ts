import pg from "pg";
import { buildApp } from "./app.ts";
import { createStore } from "./db.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX ?? 10) });
// Health must answer inside loadgen's 3 s probe even while "db" does not resolve.
const adminPool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 1000 });
const app = buildApp(createStore(pool, adminPool));
// An idle client losing its connection emits 'error'; unhandled, Node exits.
const onPoolError = (err: Error) => app.log.warn({ err }, "idle database client lost");
pool.on("error", onPoolError);
adminPool.on("error", onPoolError);

const shutdown = async () => {
  await app.close();
  await Promise.all([pool.end(), adminPool.end()]);
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
