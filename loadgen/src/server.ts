import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";
import Fastify, { type FastifyBaseLogger } from "fastify";
import fastifyStatic from "@fastify/static";
import { ensureSeed, reset, run, type Op } from "./runner.ts";
import { readCgroup, type Cgroup } from "./cgroup.ts";
import { buildStatus, type Prev } from "./status.ts";

// Built by `npm run ui:build`; the Dockerfile copies it in.
const uiRoot = fileURLToPath(new URL("../ui/dist", import.meta.url));

const runBody = {
  type: "object",
  required: ["op", "requests", "concurrency"],
  additionalProperties: false,
  properties: {
    op: { type: "string", enum: ["read", "write", "mixed"] },
    requests: { type: "integer", minimum: 1, maximum: 200000 },
    concurrency: { type: "integer", minimum: 1, maximum: 5000 },
  },
} as const;

type RunReq = { Body: { op: Op; requests: number; concurrency: number } };

const send = (raw: ServerResponse, event: string, data: unknown) =>
  raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

// ponytail: one run per process; a second loadgen instance would not see it.
let active = false;
const busy = { error: "a run is active" };

// Headers are already sent, so a failure can only be reported in-stream.
async function stream(baseUrl: string, body: RunReq["Body"], raw: ServerResponse, log: FastifyBaseLogger) {
  const closed = new AbortController();
  raw.on("close", () => closed.abort());
  const emit = (event: string, data: unknown) => {
    if (!closed.signal.aborted) send(raw, event, data);
  };
  try {
    const seed = await ensureSeed(baseUrl);
    const onProgress = (p: object) => emit("progress", p);
    emit("result", await run({ baseUrl, seed, ...body, signal: closed.signal, onProgress }));
  } catch (err) {
    log.error(err);
    emit("error", { error: String(err) });
  }
  if (!closed.signal.aborted) raw.end();
}

// Unreachable or timed out is an expected state here: it renders as down.
async function probe(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return { status: res.status, body: await res.json() };
  } catch {
    return null;
  }
}

// Previous samples for the cpu rate; replaced on each /status, never mutated.
let prev: Prev = { api: null, loadgen: null };

async function status(baseUrl: string) {
  const [health, stats] = await Promise.all([probe(`${baseUrl}/health`), probe(`${baseUrl}/stats`)]);
  const apiStats: Cgroup | null = stats?.status === 200 ? stats.body : null;
  const selfStats = readCgroup();
  const result = buildStatus({ apiHealth: health?.status ?? null, apiStats, selfStats, prev });
  prev = { api: apiStats, loadgen: selfStats };
  return result;
}

export function buildApp(baseUrl: string) {
  const app = Fastify({ logger: process.env.LOG_LEVEL !== "silent" });

  app.get("/status", () => status(baseUrl));

  app.post<RunReq>("/run", { schema: { body: runBody } }, async (req, reply) => {
    if (active) return reply.code(409).send(busy);
    active = true;
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    try {
      await stream(baseUrl, req.body, reply.raw, req.log);
    } finally {
      active = false;
    }
  });

  app.post("/reset", async (req, reply) => {
    if (active) return reply.code(409).send(busy);
    try {
      return { deleted: await reset(baseUrl) };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({ error: String(err) });
    }
  });

  app.register(fastifyStatic, { root: uiRoot });

  return app;
}

if (import.meta.main) {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) throw new Error("BASE_URL is required");
  const app = buildApp(baseUrl);
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  await app.listen({ port: Number(process.env.PORT ?? 3200), host: "0.0.0.0" });
}
