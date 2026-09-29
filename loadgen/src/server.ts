import { fileURLToPath } from "node:url";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import type { ServerResponse } from "node:http";
import Fastify, { type FastifyBaseLogger } from "fastify";
import fastifyStatic from "@fastify/static";
import { ensureSeed, reset, run, type Load, type Op } from "./runner.ts";
import { readCgroup } from "./cgroup.ts";
import { createStatusSampler, type ApiProbe, type HealthProbe } from "./status.ts";

// Built by `npm run ui:build`; the Dockerfile copies it in.
const uiRoot = fileURLToPath(new URL("../ui/dist", import.meta.url));

const op = { type: "string", enum: ["read", "write", "mixed"] } as const;
const NAME = /^[a-z0-9-]+$/;
const targetName = { type: "string", pattern: NAME.source } as const;
const DEFAULT_TARGET = "compose";

export type Target = { base: string; stats: string };
export type Targets = Readonly<Record<string, Target>>;

function httpUrl(where: string, value: unknown): string {
  const url = typeof value === "string" && URL.canParse(value) ? new URL(value) : null;
  if (!url || !["http:", "https:"].includes(url.protocol)) throw new Error(`${where} must be an absolute http URL, got ${JSON.stringify(value)}`);
  return value as string;
}

function parseTarget(name: string, value: unknown): Target {
  if (!NAME.test(name)) throw new Error(`target name ${JSON.stringify(name)} must match ${NAME.source}`);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be {base, stats}`);
  const extra = Object.keys(value).find((k) => k !== "base" && k !== "stats");
  if (extra !== undefined) throw new Error(`${name} has unknown key ${JSON.stringify(extra)}`);
  const { base, stats } = value as Record<string, unknown>;
  if (httpUrl(`${name}.base`, base).endsWith("/")) throw new Error(`${name}.base must not end with /`);
  return { base: base as string, stats: httpUrl(`${name}.stats`, stats) };
}

// TARGETS JSON: {name: {base, stats}}; "compose" is the default target.
export function parseTargets(json: string): Targets {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new Error(`TARGETS is not JSON: ${String(err)}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("TARGETS must be an object of {name: {base, stats}}");
  if (!Object.hasOwn(raw, DEFAULT_TARGET)) throw new Error(`TARGETS needs a "${DEFAULT_TARGET}" target`);
  return Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, parseTarget(name, value)]));
}

// Without TARGETS, BASE_URL alone defines the compose target.
export function targetsFromEnv(env: { TARGETS?: string; BASE_URL?: string }): Targets {
  if (env.TARGETS !== undefined) return parseTargets(env.TARGETS);
  if (env.BASE_URL === undefined) throw new Error("TARGETS or BASE_URL is required");
  return parseTargets(JSON.stringify({ [DEFAULT_TARGET]: { base: env.BASE_URL, stats: `${env.BASE_URL}/stats` } }));
}

// Absent mode means closed, so pre-open-model clients keep working.
const runBody = {
  type: "object",
  required: ["op"],
  properties: { mode: { enum: ["closed", "open"] }, op, target: targetName },
  if: { required: ["mode"], properties: { mode: { const: "open" } } },
  then: {
    required: ["rps", "durationSec"],
    additionalProperties: false,
    properties: {
      mode: true,
      op: true,
      target: true,
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
      target: true,
      requests: { type: "integer", minimum: 1, maximum: 200000 },
      concurrency: { type: "integer", minimum: 1, maximum: 5000 },
    },
  },
} as const;

type RunReq = { Body: Load & { op: Op; target?: string } };
type TargetReq = { Querystring: { target?: string } };
const targetQuery = {
  querystring: { type: "object", properties: { target: targetName }, additionalProperties: false },
} as const;

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
async function probeApi(target: Target): Promise<ApiProbe> {
  await Promise.all([resolveHost(target.base), resolveHost(target.stats)]);
  const [health, stats] = await Promise.all([getJson(`${target.base}/health`), getJson(target.stats)]);
  if (stats.status !== 200 || ![200, 503].includes(health.status)) {
    return { ok: false, kind: "http", detail: `health ${health.status}, stats ${stats.status}` };
  }
  return { ok: true, health: health.status, stats: stats.body };
}

// Stats served from another origin come from a sidecar with its own /health.
function sidecarHealthUrl(target: Target): string | null {
  const stats = new URL(target.stats).origin;
  return stats === new URL(target.base).origin ? null : `${stats}/health`;
}

async function probeSidecar(url: string): Promise<HealthProbe> {
  await resolveHost(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_MS) });
  await res.arrayBuffer();
  return res.status === 200 ? { ok: true } : { ok: false, kind: "http", detail: `health ${res.status}` };
}

declare module "fastify" {
  interface FastifyInstance {
    statusSampler: ReturnType<typeof createStatusSampler>;
  }
}

const unknownTarget = (name: string) => ({ error: `unknown target ${JSON.stringify(name)}` });

// One sampler per target, started on first use and kept until stopAll.
function targetSamplers(targets: Targets, log: FastifyBaseLogger, intervalMs: number) {
  const samplers = new Map<string, ReturnType<typeof createStatusSampler>>();
  const samplerFor = (name: string) => {
    const known = samplers.get(name);
    if (known) return known;
    const sidecar = sidecarHealthUrl(targets[name]);
    const sampler = createStatusSampler({
      probe: () => probeApi(targets[name]),
      ...(sidecar !== null && { sidecarProbe: () => probeSidecar(sidecar) }),
      selfStats: () => readCgroup(),
      onError: (err) => log.error(err),
      intervalMs,
    });
    samplers.set(name, sampler);
    sampler.start();
    return sampler;
  };
  return { samplerFor, stopAll: () => samplers.forEach((s) => s.stop()) };
}

export function buildApp(targets: Targets, { statusIntervalMs = 2000 } = {}) {
  const app = Fastify({ logger: process.env.LOG_LEVEL !== "silent" });
  const { samplerFor, stopAll } = targetSamplers(targets, app.log, statusIntervalMs);
  app.decorate("statusSampler", samplerFor(DEFAULT_TARGET));
  app.addHook("onClose", async () => stopAll());

  // Null only before the first sample lands; then wait for it.
  app.get<TargetReq>("/status", { schema: targetQuery }, (req, reply) => {
    const name = req.query.target ?? DEFAULT_TARGET;
    if (!Object.hasOwn(targets, name)) return reply.code(400).send(unknownTarget(name));
    const sampler = samplerFor(name);
    return sampler.current() ?? sampler.sampleOnce();
  });

  app.post<RunReq>("/run", { schema: { body: runBody } }, async (req, reply) => {
    const { target: name = DEFAULT_TARGET, ...load } = req.body;
    if (!Object.hasOwn(targets, name)) return reply.code(400).send(unknownTarget(name));
    if (active) return reply.code(409).send(busy);
    active = true;
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    try {
      await stream(targets[name].base, load, reply.raw, req.log);
    } finally {
      active = false;
    }
  });

  app.post<TargetReq>("/reset", { schema: targetQuery }, async (req, reply) => {
    const name = req.query.target ?? DEFAULT_TARGET;
    if (!Object.hasOwn(targets, name)) return reply.code(400).send(unknownTarget(name));
    if (active) return reply.code(409).send(busy);
    try {
      return { deleted: await reset(targets[name].base) };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({ error: String(err) });
    }
  });

  app.register(fastifyStatic, { root: uiRoot });

  return app;
}

if (import.meta.main) {
  const app = buildApp(targetsFromEnv(process.env));
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  await app.listen({ port: Number(process.env.PORT ?? 3200), host: "0.0.0.0" });
}
