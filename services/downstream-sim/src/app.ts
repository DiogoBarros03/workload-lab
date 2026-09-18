import { setTimeout as sleep } from "node:timers/promises";

import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import { DEFAULT_CONFIG, createLimiter, createRng, drawLatency, drawOutcome } from "./sim.ts";
import type { SimConfig } from "./sim.ts";

// A drawn timeout holds the socket this long, so the caller times out instead of us.
const HANG_MS = 30_000;

const configSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    latency_ms: { type: "integer", minimum: 0 },
    jitter_ms: { type: "integer", minimum: 0 },
    latency_shape: { type: "string", enum: ["uniform", "lognormal"] },
    error_rate: { type: "number", minimum: 0, maximum: 1 },
    timeout_rate: { type: "number", minimum: 0, maximum: 1 },
    rate_limit_rps: { type: "integer", minimum: 0 },
    seed: { type: "integer", minimum: 0 },
  },
} as const;

const outageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["duration_ms"],
  properties: { duration_ms: { type: "integer", minimum: 0 } },
} as const;

const callQuerySchema = {
  type: "object",
  properties: {
    latency_ms: { type: "integer", minimum: 0 },
    jitter_ms: { type: "integer", minimum: 0 },
  },
} as const;

type CallQuery = { latency_ms?: number; jitter_ms?: number };

const emptyStats = () => ({ calls: 0, ok: 0, error: 0, timeout: 0, rate_limited: 0, outage: 0 });

// Abort the wait when the caller hangs up, so a timeout draw costs nothing after that.
async function waitFor(ms: number, raw: NodeJS.EventEmitter): Promise<void> {
  const abort = new AbortController();
  raw.once("close", () => abort.abort());
  await sleep(ms, undefined, { signal: abort.signal }).catch(() => {});
}

export function buildSim(): FastifyInstance {
  let config: SimConfig = { ...DEFAULT_CONFIG };
  let rnd = createRng(config.seed);
  let outageUntil = 0;
  let stats = emptyStats();
  const takeToken = createLimiter();

  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    // Deprecated in fastify 6; a per-request log line would distort the latency measurements.
    disableRequestLogging: true,
    // Without this ajv strips unknown keys, so a typo'd sim-config field would silently no-op.
    ajv: { customOptions: { removeAdditional: false } },
  });

  app.get("/healthz", async () => ({ status: "ok" }));

  app.get<{ Querystring: CallQuery }>(
    "/call",
    { schema: { querystring: callQuerySchema } },
    async (request, reply) => {
      stats.calls += 1;
      const remaining = outageUntil - Date.now();
      if (remaining > 0) {
        stats.outage += 1;
        return reply.code(503).send({ error: "outage", remaining_ms: Math.ceil(remaining) });
      }

      if (!takeToken(config.rate_limit_rps)) {
        stats.rate_limited += 1;
        return reply
          .code(429)
          .send({ error: "rate_limited", rate_limit_rps: config.rate_limit_rps });
      }

      const outcome = drawOutcome(config, rnd);
      if (outcome === "timeout") {
        stats.timeout += 1;
        await waitFor(HANG_MS, request.raw);
        return reply.code(504).send({ error: "injected_timeout" });
      }

      const latency = drawLatency(
        config.latency_shape,
        request.query.latency_ms ?? config.latency_ms,
        request.query.jitter_ms ?? config.jitter_ms,
        rnd,
      );
      await waitFor(latency, request.raw);

      if (outcome === "error") {
        stats.error += 1;
        return reply.code(500).send({ error: "injected_error" });
      }
      stats.ok += 1;
      return reply.send({ ok: true, latency_ms: Math.round(latency) });
    },
  );

  // PUT replaces: omitted fields go back to their default, so a run never inherits the last one.
  app.put("/config", { schema: { body: configSchema } }, async (request) => {
    config = { ...DEFAULT_CONFIG, ...(request.body as Partial<SimConfig>) };
    rnd = createRng(config.seed);
    return config;
  });

  app.get("/config", async () => config);

  // Separate from config so PUT /config mid-outage does not cancel it. 0 ends it now.
  app.put("/outage", { schema: { body: outageSchema } }, async (request) => {
    const { duration_ms } = request.body as { duration_ms: number };
    outageUntil = duration_ms > 0 ? Date.now() + duration_ms : 0;
    return { active: duration_ms > 0, duration_ms };
  });

  app.get("/stats", async () => stats);

  app.delete("/stats", async () => {
    stats = emptyStats();
    return stats;
  });

  return app;
}
