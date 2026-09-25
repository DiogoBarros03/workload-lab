import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { ensureSeed, reset, run, runPool, type Seed } from "./runner.ts";

// Live tier: fires real requests at the API from compose, nothing faked.
const baseUrl = process.env.BASE_URL;
if (!baseUrl) throw new Error("BASE_URL is required");

const never = () => new AbortController().signal;

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function stop(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

// A pool whose tasks finish only when the test says so.
function gatedPool(total: number, concurrency: number, signal: AbortSignal) {
  const state = { started: 0, inFlight: 0, maxInFlight: 0 };
  const gates: (() => void)[] = [];
  const task = (i: number) => {
    state.started++;
    state.inFlight++;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    return new Promise<number>((resolve) => gates.push(() => { state.inFlight--; resolve(i); }));
  };
  const done = runPool(total, concurrency, task, signal);
  const releaseAll = () => gates.splice(0).forEach((open) => open());
  return { state, done, releaseAll };
}

test("runPool keeps exactly `concurrency` in flight and runs every task once", async () => {
  const pool = gatedPool(23, 4, never());
  const ticks = [];
  for (let settled = false; !settled; ) {
    await sleep(0);
    ticks.push(pool.state.inFlight);
    pool.releaseAll();
    settled = await Promise.race([pool.done.then(() => true), sleep(1).then(() => false)]);
  }
  assert.equal(pool.state.maxInFlight, 4);
  assert.equal(ticks[0], 4);
  assert.equal(pool.state.started, 23);
  assert.deepEqual((await pool.done).toSorted((a, b) => a - b), Array.from({ length: 23 }, (_, i) => i));
});

test("runPool with fewer tasks than workers starts only the tasks", async () => {
  const pool = gatedPool(3, 10, never());
  await sleep(0);
  assert.equal(pool.state.inFlight, 3);
  pool.releaseAll();
  assert.equal((await pool.done).length, 3);
  assert.equal(pool.state.maxInFlight, 3);
});

test("runPool stops starting tasks once aborted", async () => {
  const ctl = new AbortController();
  const pool = gatedPool(100, 5, ctl.signal);
  await sleep(0);
  ctl.abort();
  pool.releaseAll();
  const finished = await pool.done;
  assert.equal(pool.state.started, 5);
  assert.equal(finished.length, 5);
});

test("seeding leaves exactly 20 seed authors and 200 books, writes do not grow it", async () => {
  const seed = await ensureSeed(baseUrl);
  assert.equal(seed.sinkIds.length, 20);
  assert.equal(seed.bookIds.length, 200);
  const stats = await run({ baseUrl, seed, op: "write", requests: 30, concurrency: 5, signal: never() });
  assert.deepEqual(stats.statusCounts, { "201": 30 });
  const again = await ensureSeed(baseUrl);
  assert.deepEqual(again.bookIds.toSorted(), seed.bookIds.toSorted());
  assert.deepEqual(again.sinkIds.toSorted(), seed.sinkIds.toSorted());
});

test("30 mixed requests at concurrency 5 all succeed", async () => {
  const seed = await ensureSeed(baseUrl);
  const stats = await run({ baseUrl, seed, op: "mixed", requests: 30, concurrency: 5, signal: never() });
  assert.equal(stats.requests, 30);
  assert.equal(stats.errors, 0);
  const codes = Object.keys(stats.statusCounts);
  assert.ok(codes.every((c) => c === "200" || c === "201"), JSON.stringify(stats.statusCounts));
  assert.equal((stats.statusCounts["200"] ?? 0) + (stats.statusCounts["201"] ?? 0), 30);
});

test("a refused connection is a null-status sample, not a crash", async () => {
  const seed = { sinkIds: [1], bookIds: [1] };
  const stats = await run({
    baseUrl: "http://127.0.0.1:1", seed, op: "read", requests: 3, concurrency: 2, signal: never(),
  });
  assert.equal(stats.errors, 3);
  assert.deepEqual(stats.statusCounts, {});
});

test("a body that breaks after the status line keeps the received status", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-length": "1000" });
    res.write("partial", () => res.destroy());
  });
  const url = await listen(server);
  const stats = await run({ baseUrl: url, seed: { sinkIds: [1], bookIds: [1] }, op: "read", requests: 4, concurrency: 2, signal: never() });
  await stop(server);
  assert.deepEqual(stats.statusCounts, { "200": 4 });
  assert.equal(stats.errors, 0);
});

test("aborting a run resolves with only the completed samples", async () => {
  let served = 0;
  // Answers the first three requests, then hangs every later one.
  const server = createServer((_req, res) => {
    if (served++ < 3) res.end("ok");
  });
  const url = await listen(server);
  const ctl = new AbortController();
  const seed = { sinkIds: [1], bookIds: [1] };
  const pending = run({ baseUrl: url, seed, op: "read", requests: 100, concurrency: 1, signal: ctl.signal });
  await sleep(200);
  ctl.abort();
  const stats = await pending;
  await stop(server);
  assert.equal(stats.requests, 3);
  assert.deepEqual(stats.statusCounts, { "200": 3 });
  assert.equal(stats.errors, 0);
});

test("the progress timer stops when a run throws", async () => {
  const broken = { sinkIds: [1], bookIds: null } as unknown as Seed;
  const calls: number[] = [];
  await assert.rejects(run({
    baseUrl, seed: broken, op: "read", requests: 5, concurrency: 1, signal: never(),
    progressMs: 1, onProgress: (p) => calls.push(p.done),
  }));
  const after = calls.length;
  await sleep(20);
  assert.equal(calls.length, after);
});

test("progress reports done and in-flight counts, ending at the total", async () => {
  const seed = await ensureSeed(baseUrl);
  const seen: { done: number; inFlight: number }[] = [];
  await run({
    baseUrl, seed, op: "read", requests: 20, concurrency: 4, signal: never(),
    progressMs: 1, onProgress: (p) => seen.push(p),
  });
  assert.ok(seen.every((p) => p.inFlight <= 4 && p.done <= 20));
  assert.equal(seen.at(-1)?.done, 20);
  assert.equal(seen.at(-1)?.inFlight, 0);
});

test("progress windows together cover every completed request exactly once", async () => {
  const seed = await ensureSeed(baseUrl);
  const reqs: number[] = [];
  await run({
    baseUrl, seed, op: "read", requests: 200, concurrency: 8, signal: never(),
    progressMs: 1, onProgress: (p) => reqs.push(p.window.reqs),
  });
  assert.ok(reqs.length > 1, String(reqs.length));
  assert.equal(reqs.reduce((a, b) => a + b, 0), 200);
});

test("reset deletes every seed and sink author, then seeding rebuilds them", async () => {
  const seed = await ensureSeed(baseUrl);
  await run({ baseUrl, seed, op: "write", requests: 5, concurrency: 5, signal: never() });
  assert.ok((await reset(baseUrl)) >= 40);
  assert.equal(await reset(baseUrl), 0);
  const res = await fetch(`${baseUrl}/authors?name=sink&limit=1000`);
  assert.deepEqual(await res.json(), []);
  const fresh = await ensureSeed(baseUrl);
  assert.equal(fresh.sinkIds.length, 20);
  assert.equal(fresh.bookIds.length, 200);
});
