import { expect, test } from "vitest";
import { hrefOf, PROJECTS, routeFor } from "./projects";

test("project ids are unique three-digit strings in roadmap order", () => {
  const ids = PROJECTS.map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toEqual(Array.from({ length: 12 }, (_, i) => String(i).padStart(3, "0")));
});

test("exactly one project is ready, and it is 000 Baseline", () => {
  const ready = PROJECTS.filter((p) => p.status === "ready");
  expect(ready.map((p) => [p.id, p.title])).toEqual([["000", "Baseline"]]);
});

test("hrefOf joins id and slug under #/", () => {
  expect(hrefOf(PROJECTS[0])).toBe("#/000-baseline");
  expect(hrefOf(PROJECTS[5])).toBe("#/005-sharded-service");
});

test("routeFor resolves every project's own href back to it", () => {
  for (const p of PROJECTS) expect(routeFor(hrefOf(p))).toBe(p);
});

test("routeFor falls back to the first ready project for empty or unknown hashes", () => {
  for (const h of ["", "#", "#/", "#/999-nope", "#/000", "#000-baseline", "#/000-baseline/extra"]) {
    expect(routeFor(h).id).toBe("000");
  }
});
