import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { parseCpuMax, parseCpuStat, parseMemMax, readCgroup } from "./cgroup.ts";
import { buildStatus, classifyProbeError, createStatusSampler, nextPrev, type ApiProbe, type ApiStats, type DbLoad, type HealthProbe, type Prev } from "./status.ts";

test("cpu.max parses a quota to cores, and 'max' or garbage to null", () => {
  assert.equal(parseCpuMax("50000 100000\n"), 0.5);
  assert.equal(parseCpuMax("150000 100000"), 1.5);
  assert.equal(parseCpuMax("max 100000\n"), null);
  assert.equal(parseCpuMax("banana"), null);
  assert.equal(parseCpuMax(""), null);
  assert.equal(parseCpuMax("50000 0"), null);
});

test("cpu.stat picks usage and throttling counters, missing keys are null", () => {
  const text = "usage_usec 123456\nuser_usec 100000\nsystem_usec 23456\nnr_periods 40\nnr_throttled 7\nthrottled_usec 8910\n";
  assert.deepEqual(parseCpuStat(text), { cpuUsageUsec: 123456, nrThrottled: 7, throttledUsec: 8910 });
  assert.deepEqual(parseCpuStat("usage_usec 5\nnr_throttled x\n"), { cpuUsageUsec: 5, nrThrottled: null, throttledUsec: null });
  assert.deepEqual(parseCpuStat(""), { cpuUsageUsec: null, nrThrottled: null, throttledUsec: null });
});

test("memory.max parses bytes, and 'max' or garbage to null", () => {
  assert.equal(parseMemMax("134217728\n"), 134217728);
  assert.equal(parseMemMax("max\n"), null);
  assert.equal(parseMemMax("12ab"), null);
  assert.equal(parseMemMax(""), null);
});

test("readCgroup reads the four files and never throws on missing ones", () => {
  const root = mkdtempSync(join(tmpdir(), "cg-"));
  writeFileSync(join(root, "cpu.max"), "50000 100000\n");
  writeFileSync(join(root, "cpu.stat"), "usage_usec 42\nnr_throttled 3\nthrottled_usec 9\n");
  writeFileSync(join(root, "memory.current"), "1048576\n");
  writeFileSync(join(root, "memory.max"), "max\n");
  const cg = readCgroup(root);
  assert.deepEqual({ ...cg, sampledAtMs: 0 }, {
    cpuUsageUsec: 42, cpuQuotaCores: 0.5, nrThrottled: 3, throttledUsec: 9,
    memCurrentBytes: 1048576, memMaxBytes: null, sampledAtMs: 0,
  });
  assert.ok(Math.abs(cg.sampledAtMs - Date.now()) < 1000);
  const empty = readCgroup(join(root, "nope"));
  assert.equal(empty.cpuUsageUsec, null);
  assert.equal(empty.memCurrentBytes, null);
});

const sample = (over: Partial<ApiStats>): ApiStats => Object.freeze({
  cpuUsageUsec: 0, cpuQuotaCores: 0.5, nrThrottled: 0, throttledUsec: 0,
  memCurrentBytes: 100, memMaxBytes: 200, sampledAtMs: 0, db: null,
  pool: { max: 10, total: 0, idle: 0, waiting: 0 }, ...over,
});
const load = (over: Partial<DbLoad>): DbLoad => Object.freeze({
  maxConnections: 100, clientBackends: 12, activeBackends: 3, waitingBackends: 1,
  xactCommit: 0, xactRollback: 0, blksHit: 0, blksRead: 0,
  tupInserted: 0, tupUpdated: 0, tupDeleted: 0, tupFetched: 0, sampledAtMs: 0, ...over,
});
const noCgroup = { cpuCores: null, cpuQuotaCores: null, nrThrottled: null, memBytes: null, memMaxBytes: null };
const noDb = {
  connUsed: null, connMax: null, activeBackends: null, waitingBackends: null, poolBusy: null, poolMax: null,
  poolWaiting: null, commitsPerSec: null, rowsPerSec: null, cacheHitRatio: null,
};
const up = { state: "up", up: true, reason: null };
const okProbe = (stats: ApiStats, health = 200): ApiProbe => ({ ok: true, health, stats });
const failed = (kind: "timeout" | "refused" | "http" | "dns", detail = "x"): ApiProbe => ({ ok: false, kind, detail });
const fresh: Prev = Object.freeze({ api: null, loadgen: null, lastApiOkAt: null, lastSidecarOkAt: null });
const NOW = 1_000_000;
const byName = (s: ReturnType<typeof buildStatus>) =>
  Object.fromEntries(s.containers.map((c) => [c.service, c]));
const status = (apiProbe: ApiProbe, prev: Prev = fresh, selfStats = sample({})) =>
  byName(buildStatus({ apiProbe, selfStats, prev, nowMs: NOW }));

test("first sample has no cpu rate; rows are api, db, loadgen in order", () => {
  const s = buildStatus({
    apiProbe: okProbe(sample({ nrThrottled: 4 })), selfStats: sample({ cpuQuotaCores: null, memMaxBytes: null }),
    prev: fresh, nowMs: NOW,
  });
  assert.deepEqual(s.containers.map((c) => c.service), ["api", "db", "loadgen"]);
  assert.deepEqual(byName(s).api, {
    service: "api", ...up, cpuCores: null, cpuQuotaCores: 0.5, nrThrottled: 4, memBytes: 100, memMaxBytes: 200,
  });
  assert.deepEqual(byName(s).loadgen, {
    service: "loadgen", ...up, cpuCores: null, cpuQuotaCores: null, nrThrottled: 0, memBytes: 100, memMaxBytes: null,
  });
});

test("second sample: cores = usage delta over wall delta", () => {
  const prev = Object.freeze({
    api: sample({ cpuUsageUsec: 1_000_000, sampledAtMs: 10_000 }),
    loadgen: sample({ cpuUsageUsec: 500, sampledAtMs: 20_000 }),
    lastApiOkAt: NOW - 2000,
    lastSidecarOkAt: null,
  });
  const s = status(okProbe(sample({ cpuUsageUsec: 1_960_000, sampledAtMs: 12_000 })), prev,
    sample({ cpuUsageUsec: 300_500, sampledAtMs: 21_000 }));
  assert.equal(s.api.cpuCores, 0.48);
  assert.equal(s.loadgen.cpuCores, 0.3);
});

test("non-positive time delta or counter reset gives no cpu rate", () => {
  const prev = { api: sample({ cpuUsageUsec: 100, sampledAtMs: 5000 }), loadgen: sample({ cpuUsageUsec: 900, sampledAtMs: 1000 }), lastApiOkAt: null, lastSidecarOkAt: null };
  const s = status(okProbe(sample({ cpuUsageUsec: 200, sampledAtMs: 5000 })), prev, sample({ cpuUsageUsec: 10, sampledAtMs: 2000 }));
  assert.equal(s.api.cpuCores, null);
  assert.equal(s.loadgen.cpuCores, null);
});

test("health 503 means api up, db down with a reason; db never has cpu or memory", () => {
  const s = status(okProbe(sample({}), 503));
  assert.equal(s.api.state, "up");
  assert.deepEqual(s.db, {
    service: "db", state: "down", up: false, reason: "The api reports the database unreachable.", ...noCgroup, ...noDb,
  });
});

test("refused or http failure means api down at once, db down because the api is unreachable", () => {
  const recent = { ...fresh, lastApiOkAt: NOW - 1000 };
  for (const [kind, reason] of [
    ["refused", "The api refused the connection or its name did not resolve (ECONNREFUSED)."],
    ["http", "The api answered with an error (ECONNREFUSED)."],
  ] as const) {
    const s = status(failed(kind, "ECONNREFUSED"), recent);
    assert.deepEqual({ state: s.api.state, up: s.api.up, reason: s.api.reason }, { state: "down", up: false, reason }, kind);
    assert.deepEqual({ state: s.db.state, up: s.db.up, reason: s.db.reason }, { state: "down", up: false, reason: "The api is unreachable, so the database cannot be checked." });
    assert.equal(s.api.cpuCores, null);
    assert.equal(s.api.memBytes, null);
    assert.deepEqual({ state: s.loadgen.state, up: s.loadgen.up, reason: s.loadgen.reason }, up);
  }
});

test("an api hostname that does not resolve is down at once, even right after a success", () => {
  const s = status(failed("dns", "EAI_AGAIN"), { ...fresh, lastApiOkAt: NOW - 1000 });
  assert.deepEqual([s.api.state, s.api.up, s.api.reason], ["down", false, "The api's hostname does not resolve (EAI_AGAIN)."]);
  assert.deepEqual([s.db.state, s.db.reason], ["down", "The api is unreachable, so the database cannot be checked."]);
});

test("classifyProbeError: a failed hostname lookup is dns, with its code", () => {
  const lookup = (code: string) => Object.assign(new Error(`getaddrinfo ${code} api`), { code, syscall: "getaddrinfo" });
  for (const code of ["ENOTFOUND", "EAI_AGAIN", "ETIMEOUT"]) {
    assert.deepEqual(classifyProbeError(lookup(code)), { kind: "dns", detail: code });
  }
});

test("a timeout within 30 s of the last success is slow; at 30 s or with no success it is down", () => {
  const at = (ms: number | null) => status(failed("timeout", "TimeoutError"), { ...fresh, lastApiOkAt: ms });
  for (const ago of [0, 1, 29_999]) {
    const s = at(NOW - ago);
    assert.equal(s.api.state, "slow", String(ago));
    assert.equal(s.api.up, true);
    assert.equal(s.api.reason, "The api did not answer within 3 s but answered in the last 30 s.");
    assert.equal(s.db.state, "slow");
    assert.equal(s.db.up, true);
    assert.equal(s.db.reason, "The api timed out, so the database was not checked.");
    assert.deepEqual({ connUsed: s.db.connUsed, poolWaiting: s.db.poolWaiting }, { connUsed: null, poolWaiting: null });
  }
  for (const ms of [NOW - 30_000, NOW - 90_000, null]) {
    const s = at(ms);
    assert.equal(s.api.state, "down", String(ms));
    assert.equal(s.api.up, false);
    assert.equal(s.api.reason, "The api has not answered for 30 s or more (TimeoutError).");
    assert.equal(s.db.state, "down");
    assert.equal(s.db.reason, "The api is unreachable, so the database cannot be checked.");
  }
});

test("nextPrev keeps stats and stamps the last api success; a failure keeps the old stamp", () => {
  const stats = sample({ cpuUsageUsec: 9 });
  const self = sample({ cpuUsageUsec: 7 });
  const before = Object.freeze({ api: sample({}), loadgen: null, lastApiOkAt: 5, lastSidecarOkAt: 3 });
  assert.deepEqual(nextPrev({ apiProbe: okProbe(stats, 503), selfStats: self, prev: before, nowMs: NOW }),
    { api: stats, loadgen: self, lastApiOkAt: NOW, lastSidecarOkAt: 3 });
  assert.deepEqual(nextPrev({ apiProbe: failed("timeout"), sidecarProbe: { ok: true }, selfStats: self, prev: before, nowMs: NOW }),
    { api: null, loadgen: self, lastApiOkAt: 5, lastSidecarOkAt: NOW });
  assert.deepEqual(nextPrev({ apiProbe: okProbe(stats), sidecarProbe: failed("refused"), selfStats: self, prev: before, nowMs: NOW }),
    { api: stats, loadgen: self, lastApiOkAt: NOW, lastSidecarOkAt: 3 });
  assert.deepEqual(before, { api: sample({}), loadgen: null, lastApiOkAt: 5, lastSidecarOkAt: 3 });
});

test("classifyProbeError: timeout and abort, network codes, anything else is http", () => {
  const net = (code: string) => new TypeError("fetch failed", { cause: Object.assign(new Error(code), { code }) });
  assert.deepEqual(classifyProbeError(new DOMException("t", "TimeoutError")), { kind: "timeout", detail: "TimeoutError" });
  assert.deepEqual(classifyProbeError(new DOMException("a", "AbortError")), { kind: "timeout", detail: "AbortError" });
  for (const code of ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET"]) {
    assert.deepEqual(classifyProbeError(net(code)), { kind: "refused", detail: code });
  }
  assert.deepEqual(classifyProbeError(net("EPIPE")), { kind: "http", detail: "fetch failed" });
  assert.deepEqual(classifyProbeError(new SyntaxError("Unexpected token <")), { kind: "http", detail: "Unexpected token <" });
  assert.deepEqual(classifyProbeError("boom"), { kind: "http", detail: "boom" });
});

test("classifyProbeError on a real fetch to a closed port is refused", async () => {
  const srv = createServer();
  await once(srv.listen(0, "127.0.0.1"), "listening");
  const { port } = srv.address() as AddressInfo;
  await once(srv.close(), "close");
  const err = await fetch(`http://127.0.0.1:${port}/health`).then(() => null, (e: unknown) => e);
  assert.deepEqual(classifyProbeError(err), { kind: "refused", detail: "ECONNREFUSED" });
});

test("an unlimited memory limit stays null", () => {
  const s = status(okProbe(sample({ memMaxBytes: null })));
  assert.equal(s.api.memMaxBytes, null);
  assert.equal(s.api.memBytes, 100);
});

const dbRow = (cur: DbLoad | null, prev: DbLoad | null, pool = { max: 10, total: 10, idle: 0, waiting: 7 }) =>
  status(okProbe(sample({ db: cur, pool })), { api: prev && sample({ db: prev }), loadgen: null, lastApiOkAt: null, lastSidecarOkAt: null }).db;

test("db first sample: gauges and pool pass through, rates are null", () => {
  assert.deepEqual(dbRow(load({ sampledAtMs: 5000 }), null, { max: 8, total: 6, idle: 2, waiting: 3 }), {
    service: "db", ...up, ...noCgroup,
    connUsed: 12, connMax: 100, activeBackends: 3, waitingBackends: 1, poolBusy: 4, poolMax: 8,
    poolWaiting: 3, commitsPerSec: null, rowsPerSec: null, cacheHitRatio: null,
  });
});

test("db second sample: rates are counter deltas over the sample interval", () => {
  const prev = load({ xactCommit: 1000, blksHit: 900, blksRead: 100, tupInserted: 10, tupUpdated: 20, tupDeleted: 5, tupFetched: 965, sampledAtMs: 10_000 });
  const cur = load({ xactCommit: 1500, blksHit: 1700, blksRead: 300, tupInserted: 110, tupUpdated: 70, tupDeleted: 5, tupFetched: 2815, sampledAtMs: 12_000 });
  const db = dbRow(cur, prev);
  assert.equal(db.commitsPerSec, 250);
  assert.equal(db.rowsPerSec, 1000);
  assert.equal(db.cacheHitRatio, 0.8);
  assert.equal(db.poolBusy, 10);
  assert.equal(db.poolWaiting, 7);
  const other = dbRow(load({ xactCommit: 1300, blksHit: 960, blksRead: 140, tupFetched: 1400, sampledAtMs: 14_000 }), prev);
  assert.equal(other.commitsPerSec, 75);
  assert.equal(other.rowsPerSec, 100);
  assert.equal(other.cacheHitRatio, 0.6);
});

test("db rates are null on a counter reset, no elapsed time, or no block reads", () => {
  const prev = load({ xactCommit: 1000, sampledAtMs: 10_000 });
  const reset = dbRow(load({ xactCommit: 3, sampledAtMs: 12_000 }), prev);
  assert.equal(reset.commitsPerSec, null);
  assert.equal(reset.rowsPerSec, null);
  assert.equal(reset.cacheHitRatio, null);
  assert.equal(dbRow(load({ xactCommit: 1200, sampledAtMs: 10_000 }), prev).commitsPerSec, null);
  const idle = dbRow(load({ xactCommit: 1200, sampledAtMs: 12_000 }), prev);
  assert.equal(idle.commitsPerSec, 100);
  assert.equal(idle.cacheHitRatio, null);
});

test("db load missing from api stats leaves every db field null", () => {
  assert.deepEqual(dbRow(null, load({})), { service: "db", ...up, ...noCgroup, ...noDb });
});

test("sidecar stats: api row names its observer, db pool fields are null, db gauges pass through", () => {
  const sidecar = { ...sample({ nrThrottled: null, throttledUsec: null, db: load({}), pool: null }), observer: "sidecar" };
  const rows = status(okProbe(sidecar));
  assert.deepEqual(rows.api, {
    service: "api", ...up, cpuCores: null, cpuQuotaCores: 0.5, nrThrottled: null, memBytes: 100, memMaxBytes: 200, observer: "sidecar",
  });
  assert.deepEqual(rows.db, {
    service: "db", ...up, ...noCgroup,
    connUsed: 12, connMax: 100, activeBackends: 3, waitingBackends: 1, poolBusy: null, poolMax: null,
    poolWaiting: null, commitsPerSec: null, rowsPerSec: null, cacheHitRatio: null,
  });
});

const withSidecar = (sidecarProbe: HealthProbe, prev: Prev = fresh) =>
  byName(buildStatus({ apiProbe: okProbe(sample({})), sidecarProbe, selfStats: sample({}), prev, nowMs: NOW }));

test("a sidecar probe adds a fourth row, up on success, with no cgroup fields", () => {
  const s = withSidecar({ ok: true });
  assert.deepEqual(Object.keys(s), ["api", "db", "loadgen", "sidecar"]);
  assert.deepEqual(s.sidecar, { service: "sidecar", ...up, ...noCgroup });
});

test("the sidecar row follows the api's slow and down rules, in its own words", () => {
  const recent = { ...fresh, lastSidecarOkAt: NOW - 1000 };
  const slow = withSidecar(failed("timeout", "TimeoutError"), recent).sidecar;
  assert.deepEqual([slow.state, slow.up, slow.reason], ["slow", true, "The sidecar did not answer within 3 s but answered in the last 30 s."]);
  const stale = withSidecar(failed("timeout", "TimeoutError"), { ...fresh, lastSidecarOkAt: NOW - 30_000 }).sidecar;
  assert.deepEqual([stale.state, stale.reason], ["down", "The sidecar has not answered for 30 s or more (TimeoutError)."]);
  const refused = withSidecar(failed("refused", "ECONNREFUSED"), recent).sidecar;
  assert.deepEqual([refused.state, refused.up, refused.reason], ["down", false, "The sidecar refused the connection or its name did not resolve (ECONNREFUSED)."]);
  const api = withSidecar(failed("refused", "ECONNREFUSED")).api;
  assert.deepEqual([api.state, api.reason], ["up", null]);
});

test("sampler: a sidecar probe runs beside the api probe; its rejection is classified, not thrown", async () => {
  const refused = Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  const s = createStatusSampler({
    probe: async () => okProbe(sample({})), sidecarProbe: () => Promise.reject(refused), selfStats: () => sample({}),
    now: () => NOW, onError: (err) => assert.fail(String(err)),
  });
  const sidecar = byName(await s.sampleOnce()).sidecar;
  assert.deepEqual([sidecar.state, sidecar.reason], ["down", "The sidecar refused the connection or its name did not resolve (ECONNREFUSED)."]);
});

// A sampler whose probe and cgroup reads come from queues, with a fixed clock.
const sampler = (probes: (() => Promise<ApiProbe>)[], selves: ReturnType<typeof sample>[], intervalMs = 2000) => {
  const errors: unknown[] = [];
  const s = createStatusSampler({
    probe: () => probes.shift()!(), selfStats: () => selves.shift()!, intervalMs, now: () => NOW,
    onError: (err) => errors.push(err),
  });
  return { s, errors };
};

test("sampler: two samples 2 s apart give cores from the delta; current() holds the latest", async () => {
  const api = [sample({ cpuUsageUsec: 0, sampledAtMs: 10_000 }), sample({ cpuUsageUsec: 900_000, sampledAtMs: 12_000 })];
  const self = [sample({ cpuUsageUsec: 0, sampledAtMs: 10_000 }), sample({ cpuUsageUsec: 200_000, sampledAtMs: 12_000 })];
  const { s } = sampler(api.map((st) => async () => okProbe(st)), self);
  assert.equal(s.current(), null);
  const first = await s.sampleOnce();
  assert.equal(byName(first).api.cpuCores, null);
  assert.equal(first.sampledAtMs, NOW);
  const second = await s.sampleOnce();
  assert.equal(byName(second).api.cpuCores, 0.45);
  assert.equal(byName(second).loadgen.cpuCores, 0.1);
  assert.equal(s.current(), second);
});

test("sampler: a probe still in flight is shared, never overlapped by ticks or callers", async () => {
  let calls = 0;
  let release = () => {};
  const slow = () => { calls++; return new Promise<ApiProbe>((r) => { release = () => r(okProbe(sample({}))); }); };
  const { s } = sampler([slow, slow], [sample({}), sample({})], 10);
  s.start();
  const joined = s.sampleOnce();
  await sleep(60);
  assert.equal(calls, 1);
  release();
  assert.equal(byName(await joined).api.state, "up");
  await sleep(40);
  s.stop();
  assert.equal(calls, 2);
});

test("sampler: stop() ends sampling", async () => {
  let calls = 0;
  const quick = async () => { calls++; return okProbe(sample({})); };
  const { s } = sampler(Array(100).fill(quick), Array(100).fill(sample({})), 10);
  s.start();
  await sleep(35);
  s.stop();
  const seen = calls;
  assert.ok(seen >= 2, String(seen));
  await sleep(50);
  assert.equal(calls, seen);
});

test("sampler: a throwing probe yields a down snapshot, not a rejection", async () => {
  const refused = Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  const { s, errors } = sampler([() => Promise.reject(refused)], [sample({})]);
  const api = byName(await s.sampleOnce()).api;
  assert.deepEqual([api.state, api.reason], ["down", "The api refused the connection or its name did not resolve (ECONNREFUSED)."]);
  assert.deepEqual(errors, []);
});

test("sampler: a failing cgroup read on a tick goes to onError, the timer keeps running", async () => {
  let reads = 0;
  const boom = new Error("cgroup gone");
  const errors: unknown[] = [];
  const s = createStatusSampler({
    probe: async () => okProbe(sample({})), selfStats: () => { reads++; throw boom; }, intervalMs: 10, now: () => NOW,
    onError: (err: unknown) => errors.push(err),
  });
  s.start();
  await sleep(45);
  s.stop();
  assert.ok(reads >= 2, String(reads));
  assert.equal(errors.length, reads);
  assert.equal(errors[0], boom);
  assert.equal(s.current(), null);
});
