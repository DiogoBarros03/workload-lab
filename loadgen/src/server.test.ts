import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { buildApp } from "./server.ts";

process.env.LOG_LEVEL = "silent";
const baseUrl = process.env.BASE_URL;
if (!baseUrl) throw new Error("BASE_URL is required");
// Unreachable target: exercises the HTTP boundary without reaching the API.
const app = buildApp("http://127.0.0.1:1");
// Live target: the API from compose.
const live = buildApp(baseUrl);
after(() => Promise.all([app.close(), live.close()]));

const runWith = (payload: object) => app.inject({ method: "POST", url: "/run", payload });

const events = (body: string) =>
  body.split("\n\n").filter(Boolean).map((block) => ({
    event: /^event: (.*)$/m.exec(block)?.[1],
    data: JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "null"),
  }));

test("GET / serves the UI", async () => {
  const res = await app.inject({ method: "GET", url: "/" });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"] as string, /text\/html/);
  assert.match(res.body, /<form/);
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

test("POST /run reports a target failure as an error event", async () => {
  const res = await runWith({ op: "read", requests: 1, concurrency: 1 });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"] as string, /text\/event-stream/);
  assert.match(res.body, /^event: error\ndata: /m);
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
