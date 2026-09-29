import { expect, test } from "vitest";
import { hrefOf, liveProject, PROJECTS, projectOf, routeFor } from "./projects";

test("project ids are unique three-digit strings in roadmap order", () => {
  const ids = PROJECTS.map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toEqual(Array.from({ length: 12 }, (_, i) => String(i).padStart(3, "0")));
});

test("000 Baseline and 001 Sidecar are ready, the rest upcoming", () => {
  const ready = PROJECTS.filter((p) => p.status === "ready");
  expect(ready.map((p) => [p.id, p.title])).toEqual([["000", "Baseline"], ["001", "Sidecar"]]);
});

test("hrefOf namespaces id and slug under the book", () => {
  expect(hrefOf(PROJECTS[0])).toBe("#/dds/000-baseline");
  expect(hrefOf(PROJECTS[5])).toBe("#/dds/005-sharded-service");
});

const projectAt = (hash: string) => projectOf(routeFor(hash))?.id;

test("routeFor sends the empty hash, # and #/ home", () => {
  for (const h of ["", "#", "#/"]) expect(routeFor(h)).toEqual({ kind: "home" });
});

test("routeFor resolves the old unnamespaced form to the same project", () => {
  for (const p of PROJECTS) expect(routeFor(`#/${p.id}-${p.slug}`)).toEqual(routeFor(hrefOf(p)));
  expect(projectAt("#/005-sharded-service")).toBe("005");
});

test("routeFor resolves every project's own href back to it", () => {
  for (const p of PROJECTS) expect(routeFor(hrefOf(p))).toEqual({ kind: "project", project: p });
});

test("routeFor falls back to the first ready project for unknown hashes", () => {
  for (const h of ["#//", "#/999-nope", "#/000", "#000-baseline", "#/000-baseline/extra", "#/dds/", "#/xyz/005-sharded-service", "#/dds/005-sharded", "#dds/005-sharded-service"]) {
    expect(projectAt(h)).toBe("000");
  }
});

test("projectOf is null at home and the project otherwise", () => {
  expect(projectOf({ kind: "home" })).toBeNull();
  expect(projectOf({ kind: "project", project: PROJECTS[3] })).toBe(PROJECTS[3]);
});

test("000 Baseline declares api, db and loadgen", () => {
  expect(PROJECTS[0].services).toEqual(["api", "db", "loadgen"]);
});

test("every project declares at least one known service", () => {
  for (const p of PROJECTS) {
    expect(p.services.length).toBeGreaterThan(0);
    for (const s of p.services) expect(["api", "sidecar", "db", "loadgen"]).toContain(s);
  }
});

test("000 runs on compose with the compose target", () => {
  expect([PROJECTS[0].target, PROJECTS[0].runtime]).toEqual(["compose", { kind: "compose", services: ["api", "db", "loadgen"] }]);
});

test("every project's services are its runtime's services", () => {
  for (const p of PROJECTS) expect(p.services).toBe(p.runtime.services);
});

test("every later project runs a kind overlay named <id>-<slug>", () => {
  for (const p of PROJECTS.slice(1)) {
    expect(p.runtime).toEqual({ kind: "kind", overlay: `${p.id}-${p.slug}`, services: p.services });
    expect(p.target).toBe(p.id === "001" ? "k8s-sidecar" : "k8s");
  }
});

test("001 Sidecar adds the sidecar to the core services", () => {
  expect(PROJECTS[1].services).toEqual(["api", "sidecar", "db", "loadgen"]);
  expect(PROJECTS[2].services).toEqual(["api", "db", "loadgen"]);
});

test("liveProject keeps a ready project and home, and swaps an upcoming one for 000", () => {
  expect(liveProject(PROJECTS[0])).toBe(PROJECTS[0]);
  expect(liveProject(null)).toBeNull();
  expect(liveProject(PROJECTS[2])).toBe(PROJECTS[0]);
  expect(liveProject(PROJECTS[1])?.target).toBe("k8s-sidecar");
});
