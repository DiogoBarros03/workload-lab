import { afterEach, describe, expect, test } from "vitest";

import type { FastifyInstance } from "fastify";

import { buildSim } from "./app.ts";
import { DEFAULT_CONFIG } from "./sim.ts";

let sim: FastifyInstance | undefined;

// One sim per test: config and stats are per-instance, so nothing leaks between cases.
function fresh(): FastifyInstance {
  sim = buildSim();
  return sim;
}

const putConfig = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: "PUT", url: "/config", payload });

afterEach(async () => {
  await sim?.close();
  sim = undefined;
});

test("healthz answers without consulting config", async () => {
  const res = await fresh().inject("/healthz");
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: "ok" });
});

describe("PUT /config", () => {
  test("replaces rather than merges, so omitted fields return to default", async () => {
    const app = fresh();
    await putConfig(app, { latency_ms: 250 });
    const replaced = await putConfig(app, { error_rate: 0.5 });

    expect(replaced.json()).toEqual({ ...DEFAULT_CONFIG, error_rate: 0.5 });
    expect((await app.inject("/config")).json()).toEqual({ ...DEFAULT_CONFIG, error_rate: 0.5 });
  });

  test("rejects an unknown field instead of silently dropping it", async () => {
    const res = await putConfig(fresh(), { latancy_ms: 100 });
    expect(res.statusCode).toBe(400);
  });

  test("rejects a rate outside 0..1", async () => {
    const res = await putConfig(fresh(), { error_rate: 1.5 });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /call", () => {
  test("a clean draw is 200 and counts one ok", async () => {
    const app = fresh();
    const res = await app.inject("/call");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, latency_ms: 0 });
    expect((await app.inject("/stats")).json()).toEqual({
      calls: 1,
      ok: 1,
      error: 0,
      timeout: 0,
      rate_limited: 0,
    });
  });

  test("error_rate 1 is a 500 that still counted as a call", async () => {
    const app = fresh();
    await putConfig(app, { error_rate: 1 });
    const res = await app.inject("/call");

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "injected_error" });
    expect((await app.inject("/stats")).json()).toMatchObject({ calls: 1, error: 1, ok: 0 });
  });

  test("the request beats sim config on latency", async () => {
    const app = fresh();
    await putConfig(app, { latency_ms: 5000 });
    const started = performance.now();
    const res = await app.inject("/call?latency_ms=40&jitter_ms=0");

    expect(res.json()).toEqual({ ok: true, latency_ms: 40 });
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test("a negative latency_ms is rejected, not clamped", async () => {
    expect((await fresh().inject("/call?latency_ms=-1")).statusCode).toBe(400);
  });

  test("over rate_limit_rps the next call is 429 and is not drawn against", async () => {
    const app = fresh();
    await putConfig(app, { rate_limit_rps: 1, error_rate: 1 });

    expect((await app.inject("/call")).statusCode).toBe(500);
    const limited = await app.inject("/call");

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: "rate_limited", rate_limit_rps: 1 });
    expect((await app.inject("/stats")).json()).toMatchObject({
      calls: 2,
      error: 1,
      rate_limited: 1,
    });
  });
});

test("DELETE /stats zeroes every counter", async () => {
  const app = fresh();
  await app.inject("/call");
  expect((await app.inject({ method: "DELETE", url: "/stats" })).json()).toEqual({
    calls: 0,
    ok: 0,
    error: 0,
    timeout: 0,
    rate_limited: 0,
  });
  expect((await app.inject("/stats")).json()).toMatchObject({ calls: 0 });
});

// Needs a real socket: the hang is only abandoned when the client hangs up.
test("a drawn timeout hangs until the caller gives up, and stops waiting when it does", async () => {
  const app = fresh();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = (app.server.address() as { port: number }).port;
  await putConfig(app, { timeout_rate: 1 });

  const started = performance.now();
  await expect(
    fetch(`http://127.0.0.1:${port}/call`, { signal: AbortSignal.timeout(150) }),
  ).rejects.toThrow();
  expect(performance.now() - started).toBeLessThan(5000);

  expect((await app.inject("/stats")).json()).toMatchObject({ calls: 1, timeout: 1, ok: 0 });
});
