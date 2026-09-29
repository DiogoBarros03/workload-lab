import { expect, test } from "vitest";
import { bucketRps, edgeFlow, edgeReadout, idle, nodeReadout, type LiveStatus } from "./live";
import { initialRun, type Point, type Progress, type RunState } from "./run";
import type { Container } from "./status";

const row = (service: Container["service"], extra: Partial<Container> = {}): Container => ({
  service, up: true, cpuCores: null, cpuQuotaCores: null, nrThrottled: null, memBytes: null, memMaxBytes: null, ...extra,
});
const progress = (extra: Partial<Progress> = {}): Progress => ({
  done: 5000, inFlight: 231, elapsedMs: 5000, dropped: 12, targetRps: 1000,
  window: { reqs: 500, rps: 1000, p50: 4, p99: 12, errors: 0 }, ...extra,
});
const point = (rps: number, targetRps = 1000): Point => ({ elapsedMs: 0, rps, targetRps, p99: 12, errors: 0 });
const running = (p: Progress | null = progress(), series: Point[] = []): RunState => ({ ...initialRun, phase: "running", progress: p, series });
const status = (extra: Partial<LiveStatus> = {}): LiveStatus => ({
  containers: [
    row("api", { cpuCores: 0.26, cpuQuotaCores: 0.5, memBytes: 32, memMaxBytes: 128 }),
    row("db", { poolBusy: 7, poolMax: 10, poolWaiting: 3865, commitsPerSec: 420 }),
    row("loadgen"),
  ],
  apiCpu: [], dbLoad: [], health: { api: "up", sidecar: "unknown", db: "up", loadgen: "up" }, ...extra,
});
const EMPTY = status({ containers: null, health: { api: "unknown", sidecar: "unknown", db: "unknown", loadgen: "unknown" } });

test("bucketRps rounds to the nearest 1, 2 or 5 times a power of ten", () => {
  expect([0, 1, 1.4, 1.6, 3.4, 3.6, 7, 8, 14, 740, 760, 3731, 12_000].map(bucketRps)).toEqual(
    [0, 1, 1, 2, 2, 5, 5, 10, 10, 500, 1000, 5000, 10_000],
  );
  expect(bucketRps(0.03)).toBe(0.02);
  expect(() => bucketRps(-1)).toThrow(/invalid rate/);
  expect(() => bucketRps(Number.NaN)).toThrow(/invalid rate/);
});

test("edgeFlow at rest is a thin, slow, inactive line", () => {
  expect(edgeFlow(0)).toEqual({ width: 1, gap: 20, durationSec: 2.4, active: false });
  expect(edgeFlow(0.05).active).toBe(false);
  expect(edgeFlow(0.06).active).toBe(true);
});

test("edgeFlow grows wider, denser and faster with rate on a log scale", () => {
  const f = edgeFlow(1000);
  expect(f.width).toBeCloseTo(1 + Math.log10(1001) * 0.85, 6);
  expect(f.gap).toBeCloseTo(20 - Math.log10(1001) * 4, 6);
  expect(f.durationSec).toBeCloseTo(3.2 / Math.log10(1010), 6);
  expect(f.active).toBe(true);
  expect(edgeFlow(9).gap).toBeCloseTo(16, 6);
});

test("edgeFlow clamps width, gap and duration at extreme rates", () => {
  expect(edgeFlow(1e6)).toMatchObject({ width: 4.5, gap: 7 });
  expect(edgeFlow(1e10).durationSec).toBe(0.35);
});

test("edgeFlow rejects a negative or non-finite rate", () => {
  expect(() => edgeFlow(-1)).toThrow("-1");
  expect(() => edgeFlow(Number.NaN)).toThrow("NaN");
});

test("api readout: busy is the higher of cpu and memory, p99 and in-flight from the run", () => {
  const r = nodeReadout("api", running(), status());
  expect(r).toMatchObject({ busy: 0.52, p99: 12, waiting: 231, waitingLabel: "In Flight", errPerSec: 0, tone: "fill", health: "up" });
  const mem = nodeReadout("api", running(), status({ containers: [row("api", { cpuCores: 0.1, cpuQuotaCores: 0.5, memBytes: 100, memMaxBytes: 128 })] }));
  expect(mem.busy).toBeCloseTo(100 / 128, 6);
  expect(mem.tone).toBe("warn");
});

test("api busy uses whichever ratio is known and is null when neither is", () => {
  expect(nodeReadout("api", running(), status({ containers: [row("api", { memBytes: 64, memMaxBytes: 128 })] })).busy).toBe(0.5);
  expect(nodeReadout("api", running(), status({ containers: [row("api", { cpuCores: 0.3, cpuQuotaCores: 0 })] })).busy).toBeNull();
});

test("api errors per second come from the 500 ms window and turn the tone hot", () => {
  const r = nodeReadout("api", running(progress({ window: { reqs: 10, rps: 20, p50: 1, p99: 2, errors: 3 } })), status());
  expect(r.errPerSec).toBe(6);
  expect(r.tone).toBe("hot");
});

test("a down service is hot whatever its load", () => {
  const r = nodeReadout("api", running(), status({ health: { api: "down", sidecar: "unknown", db: "up", loadgen: "up" } }));
  expect([r.tone, r.health]).toEqual(["hot", "down"]);
});

test("api sparkline is cpu over quota, skipping samples without a quota", () => {
  const apiCpu = [{ at: 1, cores: 0.25, quota: 0.5, nrThrottled: 0 }, { at: 2, cores: 1, quota: null, nrThrottled: 0 }, { at: 3, cores: 0.5, quota: 0.5, nrThrottled: 0 }];
  expect(nodeReadout("api", running(), status({ apiCpu })).sparkline).toEqual([0.5, 1]);
});

test("db readout: pool busy over max, waiting from the pool, no p99 or errors", () => {
  const r = nodeReadout("db", running(), status());
  expect(r).toMatchObject({ busy: 0.7, p99: null, waiting: 3865, waitingLabel: "Waiting", errPerSec: null, tone: "warn" });
});

test("db sparkline is pool waiting normalised to its own maximum, gaps dropped", () => {
  const dbLoad = [{ at: 1, poolWaiting: 0, commitsPerSec: 1 }, { at: 2, poolWaiting: 40, commitsPerSec: 1 }, { at: 3, poolWaiting: null, commitsPerSec: 1 }, { at: 4, poolWaiting: 10, commitsPerSec: 1 }];
  expect(nodeReadout("db", running(), status({ dbLoad })).sparkline).toEqual([0, 1, 0.25]);
  expect(nodeReadout("db", running(), status({ dbLoad: dbLoad.slice(0, 1) })).sparkline).toEqual([0]);
});

test("loadgen readout: in-flight over 10 000, dropped as waiting, rps over target as sparkline", () => {
  const r = nodeReadout("loadgen", running(progress({ inFlight: 9000 }), [point(100), point(500), point(0), point(250, 250)]), status());
  expect(r).toMatchObject({ busy: 0.9, p99: null, waiting: 12, waitingLabel: "Dropped", tone: "hot" });
  expect(r.sparkline).toEqual([0.5, 1]);
});

test("loadgen sparkline keeps the last 60 s at 1 Hz, ending on the newest point", () => {
  const series = Array.from({ length: 200 }, (_, i) => point(i));
  const line = nodeReadout("loadgen", running(progress(), series), status()).sparkline;
  expect(line).toHaveLength(60);
  expect(line.at(-1)).toBe(0.199);
  expect(line[0]).toBe(0.081);
});

test("before any run or poll every readout is unknown and muted", () => {
  for (const s of ["api", "db", "loadgen"] as const) {
    expect(nodeReadout(s, initialRun, EMPTY)).toEqual({
      busy: null, busyLabel: "—", busyTitle: "Busy", p99: null, waiting: null, waitingValue: "—",
      waitingLabel: s === "api" ? "In Flight" : s === "db" ? "Waiting" : "Dropped", errPerSec: null, tone: "muted", health: "unknown", sparkline: [],
    });
  }
});

test("sidecar readout: sees the api's cpu over quota as reported by the sidecar, observer /proc", () => {
  const apiCpu = [{ at: 1, cores: 0.1, quota: 0.5, nrThrottled: null }, { at: 2, cores: 0.45, quota: 0.5, nrThrottled: null }];
  const s = status({
    containers: [row("api", { cpuCores: 0.45, cpuQuotaCores: 0.5, memBytes: 10, memMaxBytes: 128, observer: "sidecar" }), row("sidecar")],
    apiCpu, health: { api: "up", sidecar: "slow", db: "up", loadgen: "up" },
  });
  const r = nodeReadout("sidecar", running(), s);
  expect(r).toMatchObject({
    busyTitle: "Sees", busyLabel: "90 %", p99: null, waitingLabel: "Observer", waitingValue: "/proc", errPerSec: null, tone: "hot", health: "slow",
  });
  expect(r.busy).toBeCloseTo(0.9, 6);
  expect(r.sparkline).toEqual([0.2, 0.9]);
  expect(nodeReadout("sidecar", running(), status({ containers: [row("api", { cpuCores: 0.2, cpuQuotaCores: 0.5, observer: "sidecar" })] }))).toMatchObject({ busyLabel: "40 %", tone: "fill" });
});

test("sidecar sees nothing when the api reports its own stats", () => {
  const apiCpu = [{ at: 1, cores: 0.1, quota: 0.5, nrThrottled: null }, { at: 2, cores: 0.4, quota: 0.5, nrThrottled: null }];
  expect(nodeReadout("sidecar", running(), status({ apiCpu }))).toMatchObject({ busy: null, busyLabel: "—", tone: "muted", sparkline: [] });
});

test("waitingValue formats the count, or a dash when unknown", () => {
  expect(nodeReadout("db", running(), status()).waitingValue).toBe("3\u2009865");
  expect(nodeReadout("api", initialRun, EMPTY).waitingValue).toBe("—");
});

test("busyLabel is a whole percent", () => {
  expect(nodeReadout("db", running(), status()).busyLabel).toBe("70 %");
});

test("a node outside the lab's services reads as unknown", () => {
  expect(nodeReadout("cache", running(), status())).toMatchObject({ busy: null, tone: "muted", health: "unknown", sparkline: [] });
});

test("edgeReadout: loadgen to api carries the window rate with thin-space thousands", () => {
  const r = edgeReadout({ from: "loadgen", to: "api" }, running(progress({ window: { reqs: 617, rps: 1234, p50: 1, p99: 2, errors: 0 } })), status());
  expect(r).toEqual({ rps: 1234, label: "1\u2009234/s", danger: false });
});

test("edgeReadout: api to db carries commits per second, else the window rate", () => {
  expect(edgeReadout({ from: "api", to: "db" }, running(), status()).rps).toBe(420);
  const noCommits = status({ containers: [row("db", { poolBusy: 1, poolMax: 10 })] });
  expect(edgeReadout({ from: "api", to: "db" }, running(), noCommits).rps).toBe(1000);
});

test("edgeReadout is zero without a window", () => {
  expect(edgeReadout({ from: "loadgen", to: "api" }, initialRun, EMPTY)).toEqual({ rps: 0, label: "0/s", danger: false });
});

test("edgeReadout is danger when its target is hot, down or slow", () => {
  const e = { from: "loadgen", to: "api" };
  expect(edgeReadout(e, running(), status({ health: { api: "slow", sidecar: "unknown", db: "up", loadgen: "up" } })).danger).toBe(true);
  expect(edgeReadout(e, running(), status({ health: { api: "down", sidecar: "unknown", db: "up", loadgen: "up" } })).danger).toBe(true);
  expect(edgeReadout(e, running(progress({ window: { reqs: 1, rps: 1, p50: 1, p99: 1, errors: 1 } })), status()).danger).toBe(true);
  expect(edgeReadout({ from: "api", to: "db" }, running(), status({ containers: [row("db", { poolBusy: 9, poolMax: 10 })] })).danger).toBe(true);
});

test("idle when not running, before the first progress, or when progress is older than 3 s", () => {
  expect(idle(initialRun, null, 10_000)).toBe(true);
  expect(idle({ ...running(), phase: "done" }, 9_000, 10_000)).toBe(true);
  expect(idle(running(null), null, 10_000)).toBe(true);
  expect(idle(running(), 7_000, 10_000)).toBe(false);
  expect(idle(running(), 6_999, 10_000)).toBe(true);
});
