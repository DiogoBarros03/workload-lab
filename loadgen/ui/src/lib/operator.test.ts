import { expect, test } from "vitest";
import { allRunning, anyRunning, containerStates, controllable, mergeOff, summaryOf, type OpStates } from "./operator";
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

const health: Record<Service, Health> = { api: "down", db: "down", loadgen: "up" };

test("mergeOff turns exited or absent services into off", () => {
  expect(mergeOff(health, states("exited", "absent"))).toEqual({ api: "off", db: "off", loadgen: "up" });
});

test("mergeOff keeps a running service's status, even when down", () => {
  expect(mergeOff(health, states("running", "exited"))).toEqual({ api: "down", db: "off", loadgen: "up" });
});

test("mergeOff leaves the map unchanged when the operator is unknown", () => {
  expect(mergeOff(health, null)).toEqual(health);
  const apiOnly: OpStates = { api: { state: "exited", health: null } };
  expect(mergeOff(health, apiOnly)).toEqual({ api: "off", db: "down", loadgen: "up" });
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
