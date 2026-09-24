import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import Fastify, { type FastifyBaseLogger } from "fastify";
import { ensureSeed, reset, run, type Op } from "./runner.ts";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

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

export function buildApp(baseUrl: string) {
  const app = Fastify({ logger: process.env.LOG_LEVEL !== "silent" });

  app.get("/", (_req, reply) => reply.type("text/html; charset=utf-8").send(html));

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
