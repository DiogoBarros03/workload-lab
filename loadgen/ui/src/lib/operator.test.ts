import { expect, test } from "vitest";
import { allRunning, anyRunning, clusterStates, clusterSummary, containerStates, controllable, mergeOff, summaryOf, type OpStates } from "./operator";
import { PROJECTS, type Project } from "./projects";
import type { Health, Service } from "./status";

const baseline = PROJECTS[0];
const payload = {
  services: {
    api: { state: "running", health: "healthy" },
    db: { state: "exited", health: null },
    loadgen: { state: "running", health: "starting" },
  },
};

test("containerStates reads each service's state and health", () => {
  expect(containerStates(payload)).toEqual(payload.services);
});

test("containerStates rejects a payload outside the contract", () => {
  expect(() => containerStates({})).toThrow("operator payload has no services");
  expect(() => containerStates({ services: { api: { state: "paused", health: null } } })).toThrow("api state paused");
  expect(() => containerStates({ services: { db: { state: "running", health: "ok" } } })).toThrow("db health ok");
});

test("containerStates drops services the UI does not know", () => {
  expect(containerStates({ services: { cache: { state: "running", health: null } } })).toEqual({});
});

test("controllable is the project's services without loadgen", () => {
  expect(controllable(baseline)).toEqual(["api", "db"]);
  const dbOnly: Project = { ...baseline, services: ["loadgen", "db"] };
  expect(controllable(dbOnly)).toEqual(["db"]);
});

const states = (api: string, db: string) => containerStates({ services: { api: { state: api, health: null }, db: { state: db, health: null } } });

test("allRunning and anyRunning read only the given services", () => {
  const both: readonly Service[] = ["api", "db"];
  expect([allRunning(states("running", "running"), both), anyRunning(states("running", "running"), both)]).toEqual([true, true]);
  expect([allRunning(states("running", "exited"), both), anyRunning(states("running", "exited"), both)]).toEqual([false, true]);
  expect([allRunning(states("absent", "exited"), both), anyRunning(states("absent", "exited"), both)]).toEqual([false, false]);
  expect(allRunning(states("running", "exited"), ["api"])).toBe(true);
  expect([allRunning(null, both), anyRunning(null, both)]).toEqual([false, false]);
  expect(allRunning({ api: { state: "running", health: null } }, both)).toBe(false);
});

const health: Record<Service, Health> = { api: "down", sidecar: "unknown", db: "down", loadgen: "up" };

test("mergeOff turns exited or absent services into off", () => {
  expect(mergeOff(health, states("exited", "absent"))).toEqual({ api: "off", sidecar: "unknown", db: "off", loadgen: "up" });
});

test("mergeOff keeps a running service's status, even when down", () => {
  expect(mergeOff(health, states("running", "exited"))).toEqual({ api: "down", sidecar: "unknown", db: "off", loadgen: "up" });
});

test("mergeOff leaves the map unchanged when the operator is unknown", () => {
  expect(mergeOff(health, null)).toEqual(health);
  const apiOnly: OpStates = { api: { state: "exited", health: null } };
  expect(mergeOff(health, apiOnly)).toEqual({ api: "off", sidecar: "unknown", db: "down", loadgen: "up" });
});

test("mergeOff does not mutate its input", () => {
  const before = { ...health };
  mergeOff(health, states("exited", "exited"));
  expect(health).toEqual(before);
});

test("summaryOf lists each service as running or off", () => {
  expect(summaryOf(states("running", "exited"), ["api", "db"])).toBe("api running · db off");
  expect(summaryOf(states("absent", "running"), ["api", "db"])).toBe("api off · db running");
  expect(summaryOf({}, ["api"])).toBe("api unknown");
});

const container = (name: string, state: string, ready: boolean) => ({ name, state, ready, restarts: 0 });
const cluster = {
  exists: true,
  ready: "3/3",
  overlays: {
    "001-sidecar": {
      applied: true,
      pods: [
        { name: "api-1", node: "worker", containers: [container("api", "running", true), container("stats-sidecar", "waiting", false)] },
        { name: "db-0", node: "worker2", containers: [container("postgres", "terminated", false)] },
      ],
    },
    "002-ambassador": { applied: false, pods: [] },
    "003-adapter": { applied: true, pods: [{ name: "db-0", node: "worker", containers: [container("db", "running", false), container("istio", "running", true)] }] },
  },
};

test("clusterStates maps the overlay's pod containers onto services", () => {
  expect(clusterStates(cluster, "001-sidecar")).toEqual({
    api: { state: "running", health: "healthy" },
    sidecar: { state: "running", health: "starting" },
    db: { state: "exited", health: null },
    loadgen: { state: "running", health: null },
  });
});

test("clusterStates reads db from a container named db and drops unknown containers", () => {
  expect(clusterStates(cluster, "003-adapter")).toEqual({
    api: { state: "absent", health: null },
    sidecar: { state: "absent", health: null },
    db: { state: "running", health: "starting" },
    loadgen: { state: "running", health: null },
  });
});

test("clusterStates reads every service but loadgen as absent without pods or cluster", () => {
  const absent = { api: { state: "absent", health: null }, sidecar: { state: "absent", health: null }, db: { state: "absent", health: null }, loadgen: { state: "running", health: null } };
  expect(clusterStates(cluster, "002-ambassador")).toEqual(absent);
  expect(clusterStates(cluster, "009-work-queue")).toEqual(absent);
  expect(clusterStates({ exists: false }, "001-sidecar")).toEqual(absent);
});

test("clusterStates feeds mergeOff: absent and terminated containers read as off", () => {
  expect(mergeOff(health, clusterStates(cluster, "001-sidecar"))).toEqual({ api: "down", sidecar: "unknown", db: "off", loadgen: "up" });
});

test("clusterStates rejects a payload outside the contract", () => {
  expect(() => clusterStates({}, "001-sidecar")).toThrow("operator cluster payload has no exists");
  expect(() => clusterStates({ exists: true, ready: "3/3" }, "001-sidecar")).toThrow("operator cluster payload has no overlays");
  const bad = { exists: true, ready: "3/3", overlays: { x: { applied: true, pods: [{ name: "p", node: "n", containers: [container("api", "paused", true)] }] } } };
  expect(() => clusterStates(bad, "x")).toThrow("operator reported container api state paused");
});

test("clusterSummary lists node readiness and applied overlays", () => {
  expect(clusterSummary(cluster)).toEqual({ exists: true, ready: "3/3", applied: ["001-sidecar", "003-adapter"] });
  expect(clusterSummary({ exists: true, ready: "1/3", overlays: {} })).toEqual({ exists: true, ready: "1/3", applied: [] });
  expect(clusterSummary({ exists: false })).toEqual({ exists: false, ready: null, applied: [] });
  expect(() => clusterSummary({ exists: true, overlays: {} })).toThrow("operator cluster payload has no ready");
});
