import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./server.ts";
import { fakeProc, status } from "./fake-proc.ts";

process.env.LOG_LEVEL = "silent";
const load = {
  maxConnections: 100, clientBackends: 3, activeBackends: 1, waitingBackends: 0, xactCommit: 10,
  xactRollback: 0, blksHit: 90, blksRead: 10, tupInserted: 1, tupUpdated: 2, tupDeleted: 3, tupFetched: 4,
};
const procRoot = fakeProc({ 8: { cmdline: ["node", "src/server.ts"], schedstat: "3000000 1 1\n", status: status(10) } });
const cfg = { procRoot, match: "src/server.ts", selfPid: 1, limitCpuMilli: 500, limitMemBytes: 1024 };
const ok = async () => load;
const down = async () => {
  throw new Error("connect ECONNREFUSED");
};

test("/health is 200 when the api process and the db both answer", async () => {
  const res = await buildApp(cfg, ok).inject("/health");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: "ok", api: "ok", db: "ok" });
});

test("/health is 503 naming the api when no api process is visible", async () => {
  const res = await buildApp({ ...cfg, match: "absent" }, ok).inject("/health");
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.json(), { status: "unhealthy", api: "not found", db: "ok" });
});

test("/health is 503 naming the db when the query fails", async () => {
  const res = await buildApp(cfg, down).inject("/health");
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.json(), { status: "unhealthy", api: "ok", db: "unreachable" });
});

test("/stats carries proc numbers, timestamped db load, pool null, observer sidecar", async () => {
  const body = (await buildApp(cfg, ok).inject("/stats")).json();
  assert.equal(body.observer, "sidecar");
  assert.equal(body.cpuUsageUsec, 3000);
  assert.equal(body.memCurrentBytes, 10240);
  assert.equal(body.nrThrottled, null);
  assert.equal(body.pool, null);
  assert.equal(body.db.xactCommit, 10);
  assert.equal(typeof body.db.sampledAtMs, "number");
});

test("/stats keeps the proc numbers and nulls db when the query fails", async () => {
  const res = await buildApp(cfg, down).inject("/stats");
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().db, null);
  assert.equal(res.json().cpuUsageUsec, 3000);
});
