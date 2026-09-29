import { test } from "node:test";
import assert from "node:assert/strict";
import { findApiPids, cpuNanos, rssBytes } from "./proc.ts";
import { fakeProc, status } from "./fake-proc.ts";

const root = fakeProc({
  1: { cmdline: ["/pause"] },
  7: { cmdline: ["node", "src/server.ts"], schedstat: "2500000000 12345 67\n", status: status(40000) },
  9: { cmdline: ["node", "src/server.ts", "--child"], schedstat: "500000000 1 2\n", status: status(1000) },
  12: { cmdline: ["node", "src/server.ts"], schedstat: "1 1 1\n", status: status(50) },
  20: { cmdline: ["postgres"], schedstat: "99 1 1\n" },
});

test("findApiPids matches cmdline args, skips non-pid entries and the excluded pid", () => {
  assert.deepEqual(findApiPids(root, "src/server.ts", 12), [7, 9]);
  assert.deepEqual(findApiPids(root, "postgres", 12), [20]);
  assert.deepEqual(findApiPids(root, "nothing-runs-this", 12), []);
});

test("findApiPids matches across NUL-separated args", () => {
  assert.deepEqual(findApiPids(root, "node src/server.ts --child", 0), [9]);
});

test("cpuNanos sums schedstat field 1 over the pids", () => {
  assert.equal(cpuNanos(root, [7, 9]), 3_000_000_000);
  assert.equal(cpuNanos(root, [7]), 2_500_000_000);
});

test("rssBytes sums VmRSS kB times 1024", () => {
  assert.equal(rssBytes(root, [7, 9]), 41000 * 1024);
});

test("a pid that exited between scan and read counts as zero", () => {
  assert.equal(cpuNanos(root, [7, 404]), 2_500_000_000);
  assert.equal(rssBytes(root, [404]), 0);
});

test("a malformed schedstat or status throws instead of guessing", () => {
  const bad = fakeProc({ 3: { cmdline: ["x"], schedstat: "garbage\n", status: "Name:\tx\n" } });
  assert.throws(() => cpuNanos(bad, [3]), /schedstat/);
  assert.throws(() => rssBytes(bad, [3]), /VmRSS/);
});
