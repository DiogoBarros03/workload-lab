import pg from "pg";
import { buildApp } from "./app.ts";
import { createStore } from "./db.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX ?? 10) });
const app = buildApp(createStore(pool));

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
