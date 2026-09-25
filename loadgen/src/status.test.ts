import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCpuMax, parseCpuStat, parseMemMax, readCgroup, type Cgroup } from "./cgroup.ts";
import { buildStatus } from "./status.ts";

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

const sample = (over: Partial<Cgroup>): Cgroup => Object.freeze({
  cpuUsageUsec: 0, cpuQuotaCores: 0.5, nrThrottled: 0, throttledUsec: 0,
  memCurrentBytes: 100, memMaxBytes: 200, sampledAtMs: 0, ...over,
});
const byName = (s: ReturnType<typeof buildStatus>) =>
  Object.fromEntries(s.containers.map((c) => [c.service, c]));

test("first sample has no cpu rate; rows are api, db, loadgen in order", () => {
  const s = buildStatus({
    apiHealth: 200, apiStats: sample({ nrThrottled: 4 }), selfStats: sample({ cpuQuotaCores: null, memMaxBytes: null }),
    prev: { api: null, loadgen: null },
  });
  assert.deepEqual(s.containers.map((c) => c.service), ["api", "db", "loadgen"]);
  assert.deepEqual(byName(s).api, {
    service: "api", up: true, cpuCores: null, cpuQuotaCores: 0.5, nrThrottled: 4, memBytes: 100, memMaxBytes: 200,
  });
  assert.deepEqual(byName(s).loadgen, {
    service: "loadgen", up: true, cpuCores: null, cpuQuotaCores: null, nrThrottled: 0, memBytes: 100, memMaxBytes: null,
  });
});

test("second sample: cores = usage delta over wall delta", () => {
  const prev = Object.freeze({
    api: sample({ cpuUsageUsec: 1_000_000, sampledAtMs: 10_000 }),
    loadgen: sample({ cpuUsageUsec: 500, sampledAtMs: 20_000 }),
  });
  const s = byName(buildStatus({
    apiHealth: 200,
    apiStats: sample({ cpuUsageUsec: 1_960_000, sampledAtMs: 12_000 }),
    selfStats: sample({ cpuUsageUsec: 300_500, sampledAtMs: 21_000 }),
    prev,
  }));
  assert.equal(s.api.cpuCores, 0.48);
  assert.equal(s.loadgen.cpuCores, 0.3);
});

test("non-positive time delta or counter reset gives no cpu rate", () => {
  const prev = { api: sample({ cpuUsageUsec: 100, sampledAtMs: 5000 }), loadgen: sample({ cpuUsageUsec: 900, sampledAtMs: 1000 }) };
  const s = byName(buildStatus({
    apiHealth: 200,
    apiStats: sample({ cpuUsageUsec: 200, sampledAtMs: 5000 }),
    selfStats: sample({ cpuUsageUsec: 10, sampledAtMs: 2000 }),
    prev,
  }));
  assert.equal(s.api.cpuCores, null);
  assert.equal(s.loadgen.cpuCores, null);
});

test("health 503 means api up, db down; db never has cpu or memory", () => {
  const s = byName(buildStatus({ apiHealth: 503, apiStats: sample({}), selfStats: sample({}), prev: { api: null, loadgen: null } }));
  assert.equal(s.api.up, true);
  assert.deepEqual(s.db, {
    service: "db", up: false, cpuCores: null, cpuQuotaCores: null, nrThrottled: null, memBytes: null, memMaxBytes: null,
  });
  assert.equal(byName(buildStatus({ apiHealth: 200, apiStats: null, selfStats: sample({}), prev: { api: null, loadgen: null } })).db.up, true);
});

test("health unreachable means api and db down, api has no stats", () => {
  const s = byName(buildStatus({ apiHealth: null, apiStats: null, selfStats: sample({}), prev: { api: sample({}), loadgen: null } }));
  assert.equal(s.api.up, false);
  assert.equal(s.db.up, false);
  assert.equal(s.api.cpuCores, null);
  assert.equal(s.api.memBytes, null);
  assert.equal(s.loadgen.up, true);
});

test("an unlimited memory limit stays null", () => {
  const s = byName(buildStatus({ apiHealth: 200, apiStats: sample({ memMaxBytes: null }), selfStats: sample({}), prev: { api: null, loadgen: null } }));
  assert.equal(s.api.memMaxBytes, null);
  assert.equal(s.api.memBytes, 100);
});
