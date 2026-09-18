import { randomUUID } from "node:crypto";

import Fastify from "fastify";
import type { FastifyInstance, FastifyReply } from "fastify";

import { callUrl, caller, fanout, readDownstream } from "./downstream.ts";
import type { Mode } from "./downstream.ts";
import { createDrain, isRefused, readyState, runShutdown } from "./lifecycle.ts";
import type { Drain, Phase } from "./lifecycle.ts";
import { burnCpu, holdMemory } from "./work.ts";

// Content is deferred to C08 (spec/metrics.md); only this content type is contract today.
const EXPOSITION = "text/plain; version=0.0.4; charset=utf-8";

// Defaults and bounds are spec/parameters.md; ajv coerces, fills and drops unknown keys.
const cpuQuery = {
  type: "object",
  properties: {
    ms: { type: "integer", minimum: 0, default: 0 },
    rounds: { type: "integer", minimum: 1, default: 1000 },
  },
} as const;

const memoryQuery = {
  type: "object",
  properties: {
    mb: { type: "integer", minimum: 0, default: 1 },
    hold_ms: { type: "integer", minimum: 0, default: 0 },
  },
} as const;

const ioQuery = {
  type: "object",
  properties: {
    ms: { type: "integer", minimum: 0, default: 0 },
    jitter: { type: "integer", minimum: 0, default: 0 },
  },
} as const;

const fanoutQuery = {
  type: "object",
  properties: {
    n: { type: "integer", minimum: 1, default: 1 },
    mode: { type: "string", enum: ["parallel", "serial"], default: "parallel" },
  },
} as const;

type CpuQuery = { ms: number; rounds: number };
type MemoryQuery = { mb: number; hold_ms: number };
type IoQuery = { ms: number; jitter: number };
type FanoutQuery = { n: number; mode: Mode };

// 504 is the only downstream failure spec/openapi.yaml gives /io and /fanout.
function onTimeout(signal: AbortSignal, reply: FastifyReply, error: unknown) {
  if (!signal.aborted) throw error;
  return reply.code(504).send({ error: "downstream_timeout" });
}

export type Api = {
  app: FastifyInstance;
  drain: Drain;
  phase: () => Phase;
  setPhase: (next: Phase) => void;
};

export function buildApp(): Api {
  let phase: Phase = "starting";
  const drain = createDrain();
  const down = readDownstream();

  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  app.addHook("onRequest", async (request, reply) => {
    drain.enter();
    reply.header("x-request-id", request.id);
    if (isRefused(phase, request.url)) {
      return reply.code(503).send({ error: "shutting_down" });
    }
  });

  app.addHook("onResponse", async () => drain.leave());

  // Liveness never consults a dependency — see spec/openapi.yaml and C20.
  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/readyz", async (_request, reply) => {
    const state = readyState(phase);
    return reply.code(state.code).send({ status: state.status });
  });

  app.get("/metrics", async (_request, reply) => reply.type(EXPOSITION).send(""));

  app.get<{ Querystring: CpuQuery }>("/cpu", { schema: { querystring: cpuQuery } }, async (request) =>
    burnCpu(request.query.ms, request.query.rounds),
  );

  app.get<{ Querystring: MemoryQuery }>(
    "/memory",
    { schema: { querystring: memoryQuery } },
    async (request) => holdMemory(request.query.mb, request.query.hold_ms),
  );

  // attempts is 1 until C06 adds RETRY_MAX; the field exists so the shape never changes.
  app.get<{ Querystring: IoQuery }>(
    "/io",
    { schema: { querystring: ioQuery } },
    async (request, reply) => {
      const signal = AbortSignal.timeout(down.timeoutMs);
      const started = performance.now();
      try {
        await caller(callUrl(down, request.query))(signal);
        return { ms: Math.round(performance.now() - started), attempts: 1 };
      } catch (error) {
        return onTimeout(signal, reply, error);
      }
    },
  );

  // One deadline covers all n calls, so in parallel mode the slowest call sets the latency.
  app.get<{ Querystring: FanoutQuery }>(
    "/fanout",
    { schema: { querystring: fanoutQuery } },
    async (request, reply) => {
      const signal = AbortSignal.timeout(down.timeoutMs);
      try {
        return await fanout(caller(callUrl(down)), request.query.n, request.query.mode, signal);
      } catch (error) {
        return onTimeout(signal, reply, error);
      }
    },
  );

  return { app, drain, phase: () => phase, setPhase: (next) => void (phase = next) };
}

export async function start(api: Api): Promise<FastifyInstance> {
  const { app, drain, phase, setPhase } = api;
  const graceMs = Number(process.env.GRACEFUL_SHUTDOWN_MS ?? 10_000);

  await app.listen({ port: Number(process.env.PORT ?? 8080), host: "0.0.0.0" });
  setPhase("ok");

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      if (phase() === "shutting_down") return;
      setPhase("shutting_down");
      app.log.info({ signal, graceMs, inflight: drain.inflight() }, "shutting down");
      void runShutdown({
        graceMs,
        idle: drain.idle,
        close: () => app.close(),
        exit: (code) => process.exit(code),
      });
    });
  }

  return app;
}
