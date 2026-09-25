import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, windowOf } from "./stats.ts";

test("empty input has zero counts and no latency", () => {
  assert.deepEqual(summarize([], 0), {
    requests: 0,
    durationMs: 0,
    rps: 0,
    statusCounts: {},
    errors: 0,
    latency: null,
  });
});

test("single sample is every percentile", () => {
  const s = summarize([{ status: 200, ms: 7.5 }], 500);
  assert.equal(s.rps, 2);
  assert.deepEqual(s.latency, { p50: 7.5, p95: 7.5, p99: 7.5, max: 7.5, mean: 7.5 });
});

test("nearest-rank percentiles on 100 shuffled samples, input untouched", () => {
  const ms = Array.from({ length: 100 }, (_, i) => ((i * 37) % 100) + 1);
  const samples = ms.map((m) => ({ status: 201, ms: m }));
  const before = samples.map((x) => x.ms);
  const s = summarize(samples, 2000);
  assert.deepEqual(s.latency, { p50: 50, p95: 95, p99: 99, max: 100, mean: 50.5 });
  assert.equal(s.rps, 50);
  assert.deepEqual(samples.map((x) => x.ms), before);
});

test("percentiles use nearest rank, not interpolation", () => {
  const s = summarize([10, 20, 30].map((ms) => ({ status: 200, ms })), 1000);
  assert.deepEqual(s.latency, { p50: 20, p95: 30, p99: 30, max: 30, mean: 20 });
});

test("status counts per code and null status counts as a network error", () => {
  const s = summarize(
    [
      { status: 200, ms: 1 },
      { status: 201, ms: 2 },
      { status: 200, ms: 3 },
      { status: 404, ms: 4 },
      { status: null, ms: 5 },
      { status: null, ms: 6 },
    ],
    1000,
  );
  assert.equal(s.requests, 6);
  assert.deepEqual(s.statusCounts, { "200": 2, "201": 1, "404": 1 });
  assert.equal(s.errors, 2);
  assert.equal(s.latency?.max, 6);
});

test("an empty window has zero requests and no percentiles", () => {
  assert.deepEqual(windowOf([], 500), { reqs: 0, rps: 0, p50: null, p99: null, errors: 0 });
});

test("a window has nearest-rank p50/p99 and counts null and 4xx/5xx as errors", () => {
  const statuses = [200, 201, 399, 400, 404, 500, 503, null, 200, 200];
  const samples = statuses.map((status, i) => ({ status, ms: (i * 7) % 10 + 1 }));
  const before = samples.map((x) => x.ms);
  assert.deepEqual(windowOf(samples, 250), { reqs: 10, rps: 40, p50: 5, p99: 10, errors: 5 });
  assert.deepEqual(samples.map((x) => x.ms), before);
});
