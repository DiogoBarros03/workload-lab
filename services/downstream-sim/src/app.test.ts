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
      outage: 0,
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
    outage: 0,
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

const putOutage = (app: FastifyInstance, duration_ms: number) =>
  app.inject({ method: "PUT", url: "/outage", payload: { duration_ms } });

describe("PUT /outage", () => {
  // Red if the outage window stops short-circuiting /call, or stops being counted.
  test("fails every call for the window and counts the burst", async () => {
    const app = fresh();
    expect((await putOutage(app, 3000)).json()).toEqual({ active: true, duration_ms: 3000 });

    const res = await app.inject("/call");
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("outage");
    expect(res.json().remaining_ms).toBeGreaterThan(0);

    await app.inject("/call");
    expect((await app.inject("/stats")).json()).toMatchObject({ calls: 2, outage: 2, ok: 0 });
  });

  // Red if the outage check moves below the rate limiter or the outcome draw.
  test("wins over rate limiting and the error draw", async () => {
    const app = fresh();
    await putConfig(app, { error_rate: 1, rate_limit_rps: 1 });
    await putOutage(app, 3000);

    expect((await app.inject("/call")).statusCode).toBe(503);
    expect((await app.inject("/call")).statusCode).toBe(503);
    expect((await app.inject("/stats")).json()).toMatchObject({
      outage: 2,
      error: 0,
      rate_limited: 0,
    });
  });

  // Red if recovery needs a restart, or if PUT /config silently cancels an outage.
  test("recovers on its own, and PUT /config does not cancel it", async () => {
    const app = fresh();
    await putOutage(app, 3000);
    await putConfig(app, { latency_ms: 0 });
    expect((await app.inject("/call")).statusCode).toBe(503);

    expect((await putOutage(app, 0)).json()).toEqual({ active: false, duration_ms: 0 });
    expect((await app.inject("/call")).statusCode).toBe(200);
  });

  // Red if duration_ms stops being required or stops being validated.
  test("rejects a missing or negative duration", async () => {
    const app = fresh();
    expect((await app.inject({ method: "PUT", url: "/outage", payload: {} })).statusCode).toBe(400);
    expect((await putOutage(app, -1)).statusCode).toBe(400);
  });
});

describe("seeding", () => {
  const latencies = async (app: FastifyInstance, n: number) => {
    const out: number[] = [];
    for (let i = 0; i < n; i += 1) out.push((await app.inject("/call")).json().latency_ms);
    return out;
  };

  // Red the moment any draw comes from an unseeded source, or PUT /config stops re-seeding.
  test("the same seed replays the sequence and a different seed does not", async () => {
    const app = fresh();
    const config = { latency_ms: 20, jitter_ms: 15 };

    await putConfig(app, { ...config, seed: 7 });
    const first = await latencies(app, 6);
    await putConfig(app, { ...config, seed: 7 });
    expect(await latencies(app, 6)).toEqual(first);

    await putConfig(app, { ...config, seed: 8 });
    expect(await latencies(app, 6)).not.toEqual(first);
  });

  // Red if seed stops being sim config, or stops being reported back.
  test("seed defaults to 1 and is reported", async () => {
    const app = fresh();
    expect((await app.inject("/config")).json()).toMatchObject({ seed: 1 });
    expect((await putConfig(app, { seed: 99 })).json()).toMatchObject({ seed: 99 });
  });
});

describe("latency_shape", () => {
  // Red if the shape stops being sim config, defaults to anything but uniform, or loses validation.
  test("defaults to uniform, accepts lognormal, rejects anything else", async () => {
    const app = fresh();
    expect((await app.inject("/config")).json()).toMatchObject({ latency_shape: "uniform" });
    expect((await putConfig(app, { latency_shape: "lognormal" })).json()).toMatchObject({
      latency_shape: "lognormal",
    });
    expect((await putConfig(app, { latency_shape: "pareto" })).statusCode).toBe(400);
  });

  // Red if /call stops routing through the configured shape — lognormal can exceed latency+jitter.
  test("lognormal can draw beyond the uniform shape's ceiling", async () => {
    const app = fresh();
    await putConfig(app, { latency_ms: 5, jitter_ms: 5, latency_shape: "lognormal", seed: 3 });
    const drawn: number[] = [];
    for (let i = 0; i < 40; i += 1) drawn.push((await app.inject("/call")).json().latency_ms);
    expect(Math.max(...drawn)).toBeGreaterThan(10);
  });
});
