import { expect, test } from "vitest";
import { cpuPoints, dbPoints, niceTicks, secondTicks, toLivePoints } from "./chart";

test("toLivePoints maps windows to seconds, keeps a null p99 as null and flags errors", () => {
  const series = [
    { elapsedMs: 500, rps: 200, targetRps: 200, p99: 4.2, errors: 0 },
    { elapsedMs: 1000, rps: 150, targetRps: 200, p99: null, errors: 30 },
  ];
  expect(toLivePoints(series)).toEqual([
    { t: 0.5, rps: 200, target: 200, p99: 4.2, errors: 0, error: false },
    { t: 1, rps: 150, target: 200, p99: null, errors: 30, error: true },
  ]);
  expect(toLivePoints([])).toEqual([]);
});

test("cpuPoints places samples in seconds before the newest and flags throttle increases", () => {
  const s = (at: number, cores: number, nrThrottled: number | null) => ({ at, cores, quota: 0.5, nrThrottled });
  expect(cpuPoints([s(10000, 0.1, 5), s(12000, 0.3, 5), s(14000, 0.5, 9), s(16000, 0.2, null), s(18000, 0.2, 12)])).toEqual([
    { t: -8, cores: 0.1, throttled: false },
    { t: -6, cores: 0.3, throttled: false },
    { t: -4, cores: 0.5, throttled: true },
    { t: -2, cores: 0.2, throttled: false },
    { t: 0, cores: 0.2, throttled: false },
  ]);
  expect(cpuPoints([])).toEqual([]);
});

test("secondTicks steps by 5 s, widening in 5 s multiples to keep about ten ticks", () => {
  expect(secondTicks(10)).toEqual([0, 5, 10]);
  expect(secondTicks(12)).toEqual([0, 5, 10]);
  expect(secondTicks(50)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  expect(secondTicks(300)).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
});

test("niceTicks covers the max in about five round steps from zero", () => {
  expect(niceTicks(220)).toEqual([0, 50, 100, 150, 200, 250]);
  expect(niceTicks(200)).toEqual([0, 50, 100, 150, 200]);
  expect(niceTicks(8.3)).toEqual([0, 2, 4, 6, 8, 10]);
  expect(niceTicks(1.69)).toEqual([0, 0.5, 1, 1.5, 2]);
  expect(niceTicks(0)).toEqual([0, 1]);
});

test("dbPoints places samples before the newest and keeps null rates as gaps", () => {
  const s = (at: number, poolWaiting: number | null, commitsPerSec: number | null) => ({ at, poolWaiting, commitsPerSec });
  expect(dbPoints([s(4000, 0, null), s(6000, 120, 640.5), s(8000, null, 700)])).toEqual([
    { t: -4, waiting: 0, commits: null },
    { t: -2, waiting: 120, commits: 640.5 },
    { t: 0, waiting: null, commits: 700 },
  ]);
  expect(dbPoints([])).toEqual([]);
});
