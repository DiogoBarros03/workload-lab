import { fileURLToPath } from "node:url";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import type { ServerResponse } from "node:http";
import Fastify, { type FastifyBaseLogger } from "fastify";
import fastifyStatic from "@fastify/static";
import { ensureSeed, reset, run, type Load, type Op } from "./runner.ts";
import { readCgroup } from "./cgroup.ts";
import { createStatusSampler, type ApiProbe } from "./status.ts";

// Built by `npm run ui:build`; the Dockerfile copies it in.
const uiRoot = fileURLToPath(new URL("../ui/dist", import.meta.url));

const op = { type: "string", enum: ["read", "write", "mixed"] } as const;

// Absent mode means closed, so pre-open-model clients keep working.
const runBody = {
  type: "object",
  required: ["op"],
  properties: { mode: { enum: ["closed", "open"] }, op },
  if: { required: ["mode"], properties: { mode: { const: "open" } } },
  then: {
    required: ["rps", "durationSec"],
    additionalProperties: false,
    properties: {
      mode: true,
      op: true,
      rps: { type: "integer", minimum: 1, maximum: 5000 },
      durationSec: { type: "integer", minimum: 1, maximum: 300 },
      maxInFlight: { type: "integer", minimum: 1, maximum: 20000 },
    },
  },
  else: {
    required: ["requests", "concurrency"],
    additionalProperties: false,
    properties: {
      mode: true,
      op: true,
      requests: { type: "integer", minimum: 1, maximum: 200000 },
      concurrency: { type: "integer", minimum: 1, maximum: 5000 },
    },
  },
} as const;

type RunReq = { Body: Load & { op: Op } };

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
    const seed = await ensureSeed(baseUrl, closed.signal);
    const onProgress = (p: object) => emit("progress", p);
    emit("result", await run({ baseUrl, seed, ...body, signal: closed.signal, onProgress }));
  } catch (err) {
    log.error(err);
    emit("error", { error: String(err) });
  }
  if (!closed.signal.aborted) raw.end();
}

const PROBE_MS = 3000;
const LOOKUP_MS = 1000;

// A stopped container's name takes ~5 s to fail; give up after 1 s.
async function resolveHost(baseUrl: string) {
  const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || isIP(host)) return;
  const late = sleep(LOOKUP_MS, undefined, { ref: false }).then(() => {
    throw Object.assign(new Error(`lookup ${host} took over ${LOOKUP_MS} ms`), { code: "ETIMEOUT", syscall: "getaddrinfo" });
  });
  await Promise.race([lookup(host), late]);
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_MS) });
  return { status: res.status, body: await res.json() };
}

// Health may say 503 (db down); a rejection is classified by the sampler.
async function probeApi(baseUrl: string): Promise<ApiProbe> {
  await resolveHost(baseUrl);
  const [health, stats] = await Promise.all([getJson(`${baseUrl}/health`), getJson(`${baseUrl}/stats`)]);
  if (stats.status !== 200 || ![200, 503].includes(health.status)) {
    return { ok: false, kind: "http", detail: `health ${health.status}, stats ${stats.status}` };
  }
  return { ok: true, health: health.status, stats: stats.body };
}

declare module "fastify" {
  interface FastifyInstance {
    statusSampler: ReturnType<typeof createStatusSampler>;
  }
}

export function buildApp(baseUrl: string, { statusIntervalMs = 2000 } = {}) {
  const app = Fastify({ logger: process.env.LOG_LEVEL !== "silent" });
  const sampler = createStatusSampler({
    probe: () => probeApi(baseUrl),
    selfStats: () => readCgroup(),
    onError: (err) => app.log.error(err),
    intervalMs: statusIntervalMs,
  });
  app.decorate("statusSampler", sampler);
  sampler.start();
  app.addHook("onClose", async () => sampler.stop());

  // Null only before the first sample lands; then wait for it.
  app.get("/status", () => sampler.current() ?? sampler.sampleOnce());

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
