import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { buildApp } from "./server.ts";

process.env.LOG_LEVEL = "silent";
const baseUrl = process.env.BASE_URL;
if (!baseUrl) throw new Error("BASE_URL is required");
// Unreachable target: a port just released, so connecting is refused.
const closed = createServer();
await once(closed.listen(0, "127.0.0.1"), "listening");
const closedPort = (closed.address() as AddressInfo).port;
await once(closed.close(), "close");
const app = buildApp(`http://127.0.0.1:${closedPort}`);
// Live target: the API from compose.
const live = buildApp(baseUrl);
after(() => Promise.all([app.close(), live.close()]));

const runWith = (payload: object) => app.inject({ method: "POST", url: "/run", payload });

const events = (body: string) =>
  body.split("\n\n").filter(Boolean).map((block) => ({
    event: /^event: (.*)$/m.exec(block)?.[1],
    data: JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "null"),
  }));

test("GET / serves the built UI and the script it references", async () => {
  const res = await app.inject({ method: "GET", url: "/" });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"] as string, /text\/html/);
  assert.match(res.body, /<title>Load lab<\/title>/);
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(res.body)?.[1];
  assert.ok(script, res.body);
  const js = await app.inject({ method: "GET", url: script });
  assert.equal(js.statusCode, 200);
  assert.match(js.headers["content-type"] as string, /javascript/);
});

test("POST /run rejects bodies outside the schema", async () => {
  const bad = [
    {},
    { op: "delete", requests: 10, concurrency: 1 },
    { op: "read", requests: 0, concurrency: 1 },
    { op: "read", requests: 200001, concurrency: 1 },
    { op: "read", requests: 10, concurrency: 0 },
    { op: "read", requests: 10, concurrency: 5001 },
    { op: "read", requests: 1.5, concurrency: 1 },
  ];
  const codes = await Promise.all(bad.map(async (b) => (await runWith(b)).statusCode));
  assert.deepEqual(codes, bad.map(() => 400));
});

test("POST /run validates open-mode bodies and still accepts closed bodies without mode", async () => {
  const bad = [
    { mode: "open", op: "read", rps: 10 },
    { mode: "open", op: "read", rps: 0, durationSec: 1 },
    { mode: "open", op: "read", rps: 5001, durationSec: 1 },
    { mode: "open", op: "read", rps: 10, durationSec: 301 },
    { mode: "open", op: "read", rps: 10, durationSec: 1, maxInFlight: 0 },
    { mode: "open", op: "read", requests: 10, concurrency: 1 },
    { mode: "closed", op: "read", rps: 10, durationSec: 1 },
    { mode: "sideways", op: "read", requests: 10, concurrency: 1 },
  ];
  const codes = await Promise.all(bad.map(async (b) => (await runWith(b)).statusCode));
  assert.deepEqual(codes, bad.map(() => 400));
  const ok = [
    { op: "read", requests: 1, concurrency: 1 },
    { mode: "closed", op: "read", requests: 1, concurrency: 1 },
  ];
  for (const b of ok) assert.equal((await runWith(b)).statusCode, 200);
});

test("POST /run reports a target failure as an error event", async () => {
  const res = await runWith({ op: "read", requests: 1, concurrency: 1 });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"] as string, /text\/event-stream/);
  assert.match(res.body, /^event: error\ndata: /m);
});

test("a run against a target that never answers fails within 6 s and frees the slot", { timeout: 15_000 }, async (t) => {
  const stub = createServer(() => {});
  await once(stub.listen(0, "127.0.0.1"), "listening");
  const target = buildApp(`http://127.0.0.1:${(stub.address() as AddressInfo).port}`);
  t.after(async () => {
    stub.closeAllConnections();
    stub.close();
    await target.close();
  });
  const small = { op: "read", requests: 1, concurrency: 1 };
  const started = Date.now();
  const first = await target.inject({ method: "POST", url: "/run", payload: small });
  assert.ok(Date.now() - started < 6000, String(Date.now() - started));
  const seen = events(first.body);
  assert.deepEqual(seen.map((e) => e.event), ["error"], first.body);
  assert.match(seen[0].data.error, /^Error: seed failed: /);
  const second = await target.inject({ method: "POST", url: "/run", payload: small });
  assert.equal(second.statusCode, 200);
});

test("POST /reset answers 502 when the target is unreachable", async () => {
  const res = await app.inject({ method: "POST", url: "/reset" });
  assert.equal(res.statusCode, 502);
});

test("POST /run streams progress, then exactly one result as the last event", async () => {
  const res = await live.inject({ method: "POST", url: "/run", payload: { op: "read", requests: 50, concurrency: 5 } });
  assert.equal(res.statusCode, 200);
  const seen = events(res.body);
  assert.ok(seen.some((e) => e.event === "progress"), res.body);
  assert.deepEqual(seen.filter((e) => e.event !== "progress").map((e) => e.event), ["result"]);
  assert.equal(seen.at(-1)?.event, "result");
  assert.equal(seen.at(-1)?.data.requests, 50);
});

test("every progress event carries a window with the five stats", async () => {
  const res = await live.inject({ method: "POST", url: "/run", payload: { op: "read", requests: 50, concurrency: 5 } });
  const progress = events(res.body).filter((e) => e.event === "progress");
  assert.ok(progress.length > 0, res.body);
  for (const p of progress) {
    assert.deepEqual(Object.keys(p.data.window).toSorted(), ["errors", "p50", "p99", "reqs", "rps"]);
  }
  assert.equal(progress.reduce((n, p) => n + p.data.window.reqs, 0), 50);
});

test("an open run at 50/s for 2 s holds the rate and reports it", async () => {
  const payload = { mode: "open", op: "read", rps: 50, durationSec: 2 };
  const res = await live.inject({ method: "POST", url: "/run", payload });
  const seen = events(res.body);
  const result = seen.at(-1);
  assert.equal(result?.event, "result", res.body);
  assert.ok(result.data.requests >= 90 && result.data.requests <= 110, String(result.data.requests));
  assert.equal(result.data.dropped, 0);
  assert.equal(result.data.targetRps, 50);
  assert.equal(typeof result.data.maxInFlightSeen, "number");
  const progress = seen.filter((e) => e.event === "progress");
  assert.ok(progress.length > 0, res.body);
  assert.ok(progress.every((p) => p.data.targetRps === 50 && p.data.dropped === 0), res.body);
});

test("one run at a time; closing the stream stops the run and frees the slot", async () => {
  await live.listen({ port: 0, host: "127.0.0.1" });
  const url = `http://127.0.0.1:${(live.server.address() as AddressInfo).port}`;
  const post = (path: string, body?: object, signal?: AbortSignal) => fetch(url + path, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const small = { op: "read", requests: 1, concurrency: 1 };
  const ctl = new AbortController();
  const first = await post("/run", { op: "read", requests: 200000, concurrency: 20 }, ctl.signal);
  assert.equal(first.status, 200);

  const second = await post("/run", small);
  assert.equal(second.status, 409);
  assert.deepEqual(await second.json(), { error: "a run is active" });
  const resetDuring = await post("/reset");
  assert.equal(resetDuring.status, 409);
  assert.deepEqual(await resetDuring.json(), { error: "a run is active" });

  ctl.abort();
  const deadline = Date.now() + 2000;
  let status = 409;
  while (status === 409 && Date.now() < deadline) {
    await sleep(50);
    const res = await post("/run", small);
    status = res.status;
    await res.text();
  }
  assert.equal(status, 200);
});

test("GET /status reports api and db down, not an error, when the api is unreachable", async () => {
  const res = await app.inject({ method: "GET", url: "/status" });
  assert.equal(res.statusCode, 200);
  const rows = Object.fromEntries(res.json().containers.map((c: { service: string }) => [c.service, c]));
  assert.deepEqual(Object.keys(rows), ["api", "db", "loadgen"]);
  assert.equal(rows.api.up, false);
  assert.equal(rows.api.state, "down");
  assert.equal(rows.api.reason, "The api refused the connection or its name did not resolve (ECONNREFUSED).");
  assert.equal(rows.db.up, false);
  assert.equal(rows.db.state, "down");
  assert.equal(rows.db.reason, "The api is unreachable, so the database cannot be checked.");
  assert.equal(rows.api.memBytes, null);
  assert.equal(rows.loadgen.up, true);
  assert.equal(rows.loadgen.state, "up");
  assert.equal(rows.loadgen.reason, null);
  assert.equal(typeof rows.loadgen.memBytes, "number");
});

test("GET /status reports an api whose hostname does not resolve as down within about 1 s", { timeout: 15_000 }, async () => {
  const target = buildApp("http://api.invalid:3000");
  try {
    const started = Date.now();
    const res = await target.inject({ method: "GET", url: "/status" });
    const took = Date.now() - started;
    const api = res.json().containers.find((c: { service: string }) => c.service === "api");
    assert.ok(took < 1500, String(took));
    assert.equal(api.state, "down");
    assert.match(api.reason, /^The api's hostname does not resolve \((ENOTFOUND|EAI_AGAIN|ETIMEOUT)\)\.$/);
  } finally {
    await target.close();
  }
});

test("GET /status shows an api that stops answering after a success as slow, after the 3 s probe", async () => {
  let hang = false;
  const stats = { sampledAtMs: 0, db: null, pool: { max: 10, total: 0, idle: 0, waiting: 0 } };
  // Answers until `hang` is set, then never responds.
  const stub = createServer((req, res) => {
    if (hang) return;
    const body = req.url === "/health" ? { status: "ok" } : { ...stats, sampledAtMs: Date.now() };
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
  });
  await once(stub.listen(0, "127.0.0.1"), "listening");
  const target = buildApp(`http://127.0.0.1:${(stub.address() as AddressInfo).port}`, { statusIntervalMs: 60_000 });
  // A fresh sample, then /status must serve exactly it.
  const rows = async () => {
    const fresh = await target.statusSampler.sampleOnce();
    const res = (await target.inject({ method: "GET", url: "/status" })).json();
    assert.equal(res.sampledAtMs, fresh.sampledAtMs);
    return Object.fromEntries(res.containers.map((c: { service: string }) => [c.service, c]));
  };
  try {
    assert.equal((await rows()).api.state, "up");
    hang = true;
    const started = Date.now();
    const slow = await rows();
    const took = Date.now() - started;
    assert.ok(took >= 2900 && took < 4500, String(took));
    assert.deepEqual([slow.api.state, slow.api.up, slow.api.reason], ["slow", true, "The api did not answer within 3 s but answered in the last 30 s."]);
    assert.deepEqual([slow.db.state, slow.db.up], ["slow", true]);
  } finally {
    await target.close();
    stub.closeAllConnections();
    stub.close();
  }
});

test("GET /status shows live api and db, with an api cpu rate on the second sample", async () => {
  const get = async () => {
    await live.statusSampler.sampleOnce();
    return Object.fromEntries(
      (await live.inject({ method: "GET", url: "/status" })).json().containers.map((c: { service: string }) => [c.service, c]),
    );
  };
  const first = await get();
  assert.deepEqual([first.api.state, first.api.up, first.api.reason], ["up", true, null]);
  assert.deepEqual([first.db.state, first.db.up, first.db.reason], ["up", true, null]);
  await sleep(1000);
  const second = await get();
  assert.equal(typeof second.api.cpuCores, "number");
  assert.ok(second.api.cpuCores >= 0 && second.api.cpuCores <= 1, String(second.api.cpuCores));
  assert.equal(second.api.cpuQuotaCores, 0.5);
  assert.equal(second.api.memMaxBytes, 134217728);
  assert.equal(typeof second.api.memBytes, "number");
  assert.equal(typeof second.api.nrThrottled, "number");
});

test("GET /status maps postgres load and the api pool onto the db row", async () => {
  const db = async () => (await live.statusSampler.sampleOnce()).containers.find((c) => c.service === "db")!;
  await db();
  const res = await live.inject({ method: "POST", url: "/run", payload: { op: "read", requests: 300, concurrency: 10 } });
  assert.equal(res.statusCode, 200);
  const second = await db();
  assert.ok(second.connUsed! >= 1, String(second.connUsed));
  assert.ok(second.connMax! >= second.connUsed!, String(second.connMax));
  assert.equal(second.poolMax, 10);
  assert.equal(typeof second.commitsPerSec, "number");
  assert.ok(second.commitsPerSec! > 0, String(second.commitsPerSec));
  assert.equal(typeof second.rowsPerSec, "number");
});

test("GET /status serves one sampled snapshot to every poller, stamped with sampledAtMs", async () => {
  const target = buildApp(baseUrl, { statusIntervalMs: 60_000 });
  try {
    const before = Date.now();
    const polls = await Promise.all([1, 2, 3].map(() => target.inject({ method: "GET", url: "/status" })));
    await sleep(200);
    polls.push(await target.inject({ method: "GET", url: "/status" }));
    const stamps = polls.map((r) => r.json().sampledAtMs);
    assert.ok(stamps[0] >= before && stamps[0] <= Date.now(), String(stamps[0]));
    assert.deepEqual(stamps, [stamps[0], stamps[0], stamps[0], stamps[0]]);
  } finally {
    await target.close();
  }
});

test("GET /status resamples on the configured interval", async () => {
  const target = buildApp(baseUrl, { statusIntervalMs: 100 });
  try {
    const first = (await target.inject({ method: "GET", url: "/status" })).json();
    await sleep(350);
    const later = (await target.inject({ method: "GET", url: "/status" })).json();
    assert.ok(later.sampledAtMs - first.sampledAtMs >= 200, `${first.sampledAtMs} -> ${later.sampledAtMs}`);
    assert.equal(typeof later.containers.find((c: { service: string }) => c.service === "api").cpuCores, "number");
  } finally {
    await target.close();
  }
});
