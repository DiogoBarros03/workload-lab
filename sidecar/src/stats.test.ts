import { test } from "node:test";
import assert from "node:assert/strict";
import { procStats, parseConfig } from "./stats.ts";
import { fakeProc, status } from "./fake-proc.ts";

const procRoot = fakeProc({
  5: { cmdline: ["node", "src/server.ts"], schedstat: "1234567890 1 1\n", status: status(2048) },
  6: { cmdline: ["node", "src/server.ts"], schedstat: "7 1 1\n", status: status(1) },
});
const cfg = { procRoot, match: "src/server.ts", selfPid: 6, limitCpuMilli: 500, limitMemBytes: 134217728 };

test("procStats reports the api's cpu in usec, rss, the Downward API limits and no throttling", () => {
  assert.deepEqual(procStats(cfg, 1700000000000), {
    cpuUsageUsec: 1234567,
    cpuQuotaCores: 0.5,
    nrThrottled: null,
    throttledUsec: null,
    memCurrentBytes: 2048 * 1024,
    memMaxBytes: 134217728,
    sampledAtMs: 1700000000000,
    observer: "sidecar",
  });
});

test("procStats with no api process gives null usage but keeps the limits", () => {
  const s = procStats({ ...cfg, match: "not-running" }, 1);
  assert.equal(s.cpuUsageUsec, null);
  assert.equal(s.memCurrentBytes, null);
  assert.equal(s.cpuQuotaCores, 0.5);
  assert.equal(s.memMaxBytes, 134217728);
});

const env = { DATABASE_URL: "postgres://app:app@db:5432/app", LIMIT_CPU_MILLI: "250", LIMIT_MEM_BYTES: "67108864" };

test("parseConfig reads env with documented defaults for port and match", () => {
  assert.deepEqual(parseConfig(env, 42), {
    databaseUrl: "postgres://app:app@db:5432/app",
    port: 3001,
    procRoot: "/proc",
    match: "src/server.ts",
    selfPid: 42,
    limitCpuMilli: 250,
    limitMemBytes: 67108864,
  });
  assert.equal(parseConfig({ ...env, PORT: "4000", API_MATCH: "app.js" }, 1).port, 4000);
  assert.equal(parseConfig({ ...env, API_MATCH: "app.js" }, 1).match, "app.js");
});

test("parseConfig fails fast on a missing url or a non-numeric limit", () => {
  assert.throws(() => parseConfig({ ...env, DATABASE_URL: undefined }, 1), /DATABASE_URL/);
  assert.throws(() => parseConfig({ ...env, LIMIT_CPU_MILLI: undefined }, 1), /LIMIT_CPU_MILLI/);
  assert.throws(() => parseConfig({ ...env, LIMIT_MEM_BYTES: "64Mi" }, 1), /LIMIT_MEM_BYTES/);
});
