// The contract suite. Black-box HTTP against any base URL; it imports nothing from services/.
// One test per endpoint, on purpose: a failing run must read as one line per endpoint.

import { expect, test } from "vitest";

const base = (process.env.CONTRACT_BASE_URL ?? "").replace(/\/+$/, "");

if (!base) {
  throw new Error("CONTRACT_BASE_URL is unset — run `npm run contract -- <base-url>`");
}

const JOB_STATUSES = ["queued", "running", "succeeded", "failed"];

async function call(path: string, init?: RequestInit) {
  const res = await fetch(base + path, init);
  const type = res.headers.get("content-type") ?? "";
  const body: unknown = type.includes("application/json") ? await res.json() : await res.text();
  return { status: res.status, type, body };
}

function submitEcho() {
  return call("/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "echo", payload: { ping: 1 } }),
  });
}

test("GET /cpu", async () => {
  const res = await call("/cpu?ms=10&rounds=100");
  expect(res.status, `expected 200, got ${res.status}`).toBe(200);
  expect(res.body).toMatchObject({
    ms: expect.any(Number),
    rounds: expect.any(Number),
    hash: expect.any(String),
  });
});

test("GET /memory", async () => {
  const res = await call("/memory?mb=1&hold_ms=10");
  expect(res.status, `expected 200, got ${res.status}`).toBe(200);
  expect(res.body).toMatchObject({ mb: 1, hold_ms: 10 });
});

test("GET /io", async () => {
  const res = await call("/io?ms=10&jitter=0");
  expect(res.status, `expected 200, got ${res.status}`).toBe(200);
  expect(res.body).toMatchObject({ ms: expect.any(Number), attempts: expect.any(Number) });
});

test("GET /fanout", async () => {
  const res = await call("/fanout?n=2&mode=parallel");
  expect(res.status, `expected 200, got ${res.status}`).toBe(200);
  expect(res.body).toMatchObject({
    n: 2,
    mode: "parallel",
    ok: expect.any(Number),
    failed: expect.any(Number),
    ms: expect.any(Number),
  });
});

test("GET /flaky", async () => {
  const res = await call("/flaky?error_rate=0&timeout_rate=0");
  expect(res.status, `expected 200 with both rates at 0, got ${res.status}`).toBe(200);
  expect(res.body).toMatchObject({ ok: true });
});

test("GET /catalog/:id", async () => {
  const res = await call("/catalog/1");
  expect(res.status, `expected 200 for seeded id 1, got ${res.status}`).toBe(200);
  expect(res.body).toMatchObject({ id: "1", name: expect.any(String) });

  const missing = await call("/catalog/not-a-seeded-id");
  expect(missing.status, `expected 404 for an unknown id, got ${missing.status}`).toBe(404);
});

test("POST /jobs", async () => {
  const res = await submitEcho();
  expect([200, 202], `expected 200 (WORK=sync) or 202 (WORK=queue), got ${res.status}`).toContain(
    res.status,
  );
  expect(res.body).toMatchObject({ id: expect.any(String), status: expect.any(String) });
  expect(JOB_STATUSES, "status must be one of the four contract statuses").toContain(
    (res.body as { status: string }).status,
  );
});

test("GET /jobs/:id", async () => {
  const created = await submitEcho();
  expect([200, 202], `POST /jobs setup: expected 200 or 202, got ${created.status}`).toContain(
    created.status,
  );

  const { id } = created.body as { id: string };
  const res = await call(`/jobs/${id}`);
  expect(res.status, `expected 200 for the id just created, got ${res.status}`).toBe(200);
  expect(res.body).toMatchObject({ id, status: expect.any(String) });
  expect(JOB_STATUSES, "status must be one of the four contract statuses").toContain(
    (res.body as { status: string }).status,
  );
});

test("GET /healthz", async () => {
  const res = await call("/healthz");
  expect(res.status, `expected 200, got ${res.status}`).toBe(200);
  expect(res.body).toMatchObject({ status: "ok" });
});

test("GET /readyz", async () => {
  const res = await call("/readyz");
  expect(res.status, `expected 200 from a ready service, got ${res.status}`).toBe(200);
  expect(res.body).toMatchObject({ status: "ok" });
});

test("GET /metrics", async () => {
  const res = await call("/metrics");
  expect(res.status, `expected 200, got ${res.status}`).toBe(200);
  // Content is deferred to C08; only the exposition content type is contract now.
  expect(res.type, `expected a text/plain content type, got "${res.type}"`).toMatch(/^text\/plain/);
});
