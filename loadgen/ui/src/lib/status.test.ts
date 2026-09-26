import { expect, test } from "vitest";
import { PROJECTS, type Project } from "./projects";
import { dbLoad, deriveStatus, isOutage, loadTone, nextSince, outageMessages, pillsFor, runWarning, type Container } from "./status";

const row = (service: Container["service"], up: boolean): Container => ({
  service, up, cpuCores: null, cpuQuotaCores: null, nrThrottled: null, memBytes: null, memMaxBytes: null,
});
const healthy = [row("api", true), row("db", true), row("loadgen", true)];
const dbDown = [row("api", true), row("db", false), row("loadgen", true)];
const apiDown = [row("api", false), row("db", false), row("loadgen", true)];

test("deriveStatus maps up and down per service", () => {
  expect(deriveStatus(healthy, null)).toEqual({
    health: { api: "up", db: "up", loadgen: "up" }, notes: { api: null, db: null, loadgen: null }, reason: null,
  });
  expect(deriveStatus(dbDown, null).health).toEqual({ api: "up", db: "down", loadgen: "up" });
  expect(deriveStatus(apiDown, null).health).toEqual({ api: "down", db: "down", loadgen: "up" });
});

test("deriveStatus is unknown everywhere before the first poll and when polling fails", () => {
  const none = { api: null, db: null, loadgen: null };
  expect(deriveStatus(null, null)).toEqual({ health: { api: "unknown", db: "unknown", loadgen: "unknown" }, notes: none, reason: null });
  expect(deriveStatus(null, "TypeError: Failed to fetch")).toEqual({
    health: { api: "unknown", db: "unknown", loadgen: "unknown" }, notes: none, reason: "TypeError: Failed to fetch",
  });
});

test("deriveStatus treats a service missing from the payload as unknown", () => {
  expect(deriveStatus([row("api", true)], null).health).toEqual({ api: "up", db: "unknown", loadgen: "unknown" });
});

test("outageMessages gives one plain line per problem in the order api, db, loadgen", () => {
  expect(outageMessages(deriveStatus(healthy, null))).toEqual([]);
  expect(outageMessages(deriveStatus(null, null))).toEqual([]);
  expect(outageMessages(deriveStatus(dbDown, null))).toEqual(["db is unreachable: the api's health check answers 503."]);
  expect(outageMessages(deriveStatus(apiDown, null))).toEqual([
    "api is unreachable.",
    "db cannot be checked while the api is down.",
  ]);
  expect(outageMessages(deriveStatus(null, "boom"))).toEqual(["loadgen is unreachable: status polling failed."]);
});

test("runWarning names the first down service, api before db, and nothing otherwise", () => {
  expect(runWarning(deriveStatus(apiDown, null))).toBe("api is down: requests will fail.");
  expect(runWarning(deriveStatus(dbDown, null))).toBe("db is down: requests will fail.");
  expect(runWarning(deriveStatus(healthy, null))).toBeNull();
  expect(runWarning(deriveStatus(null, "boom"))).toBeNull();
});

test("nextSince keeps the first time an outage was seen and clears once healthy", () => {
  expect(nextSince(null, true, 1000)).toBe(1000);
  expect(nextSince(1000, true, 5000)).toBe(1000);
  expect(nextSince(1000, false, 9000)).toBeNull();
  expect(nextSince(null, false, 9000)).toBeNull();
});

const slowApi: Container[] = [
  { ...row("api", true), state: "slow", reason: "api answered its probe in 2.4 s." },
  { ...row("db", true), state: "up", reason: null },
  { ...row("loadgen", true), state: "up", reason: null },
];

test("deriveStatus uses the server state, so a late api reads slow with its reason", () => {
  const v = deriveStatus(slowApi, null);
  expect(v.health).toEqual({ api: "slow", db: "up", loadgen: "up" });
  expect(v.notes).toEqual({ api: "api answered its probe in 2.4 s.", db: null, loadgen: null });
});

test("deriveStatus falls back to the up boolean when a legacy payload lacks state", () => {
  expect(deriveStatus(apiDown, null).health).toEqual({ api: "down", db: "down", loadgen: "up" });
  expect(deriveStatus([{ ...row("api", true), state: "down" }], null).health.api).toBe("down");
});

test("a slow service is not an outage and adds no banner line", () => {
  const v = deriveStatus(slowApi, null);
  expect(isOutage(v)).toBe(false);
  expect(outageMessages(v)).toEqual([]);
  expect(runWarning(v)).toBeNull();
});

test("outageMessages prefers the server reason for a down service", () => {
  const down: Container[] = [
    { ...row("api", false), state: "down", reason: "api refused the connection." },
    { ...row("db", false), state: "down", reason: null },
  ];
  expect(outageMessages(deriveStatus(down, null))).toEqual([
    "api refused the connection.",
    "db cannot be checked while the api is down.",
  ]);
});

test("loadTone is charcoal below 0.6, yellow to 0.85, red from 0.85, muted when unknown", () => {
  expect([0, 0.3, 0.599].map(loadTone)).toEqual(["fill", "fill", "fill"]);
  expect([0.6, 0.72, 0.849].map(loadTone)).toEqual(["warn", "warn", "warn"]);
  expect([0.85, 1, 1.4].map(loadTone)).toEqual(["hot", "hot", "hot"]);
  expect(loadTone(null)).toBe("muted");
});

test("dbLoad maps the db fields and reads missing ones as null", () => {
  const full = {
    ...row("db", true), connUsed: 12, connMax: 100, activeBackends: 7, waitingBackends: 2, poolBusy: 10,
    poolMax: 10, poolWaiting: 431, commitsPerSec: 812.5, rowsPerSec: 1625, cacheHitRatio: 0.999,
  };
  expect(dbLoad(full)).toEqual({
    connUsed: 12, connMax: 100, activeBackends: 7, waitingBackends: 2, poolBusy: 10,
    poolMax: 10, poolWaiting: 431, commitsPerSec: 812.5, rowsPerSec: 1625, cacheHitRatio: 0.999,
  });
  expect(dbLoad({ ...row("db", true), poolWaiting: 3 })).toEqual({
    connUsed: null, connMax: null, activeBackends: null, waitingBackends: null, poolBusy: null,
    poolMax: null, poolWaiting: 3, commitsPerSec: null, rowsPerSec: null, cacheHitRatio: null,
  });
});

const baseline = PROJECTS[0];

test("pillsFor labels each declared service by its health, in declared order", () => {
  expect(pillsFor(baseline, { api: "up", db: "slow", loadgen: "down" })).toEqual([
    { service: "api", state: "up", label: "api UP", ariaLabel: "api is up" },
    { service: "db", state: "slow", label: "db SLOW", ariaLabel: "db is slow" },
    { service: "loadgen", state: "down", label: "loadgen ERROR", ariaLabel: "loadgen is down" },
  ]);
  expect(pillsFor(baseline, { api: "unknown", db: "up", loadgen: "up" })[0]).toEqual(
    { service: "api", state: "unknown", label: "api ?", ariaLabel: "api status is unknown" },
  );
});

test("pillsFor reads a service missing from the map as unknown", () => {
  expect(pillsFor(baseline, { api: "up" }).map((x) => [x.service, x.state])).toEqual([["api", "up"], ["db", "unknown"], ["loadgen", "unknown"]]);
});

test("pillsFor shows only the services the project declares", () => {
  const apiOnly: Project = { ...baseline, services: ["api"] };
  expect(pillsFor(apiOnly, { api: "down", db: "down", loadgen: "down" }).map((x) => x.label)).toEqual(["api ERROR"]);
});

test("pillsFor is empty for an upcoming project: its containers do not run yet", () => {
  const upcoming = PROJECTS.find((p) => p.status === "upcoming");
  if (!upcoming) throw new Error("no upcoming project");
  expect(upcoming.services.length).toBeGreaterThan(0);
  expect(pillsFor(upcoming, { api: "up", db: "up", loadgen: "up" })).toEqual([]);
});
