import { expect, test } from "vitest";
import { unitsOf } from "./arch";
import { LEARNING } from "./learning";
import { PROJECTS } from "./projects";

test("every project has a Learning entry and no entry is orphaned", () => {
  expect(Object.keys(LEARNING).toSorted()).toEqual(PROJECTS.map((p) => p.id));
});

test("every edge joins two existing nodes in adjacent columns, left to right", () => {
  for (const [id, { architecture: a }] of Object.entries(LEARNING)) {
    const column = new Map(unitsOf(a.nodes).flatMap((u, i) => u.nodes.map((n) => [n.id, i] as const)));
    expect(column.size, id).toBe(a.nodes.length);
    for (const e of a.edges) expect([id, column.get(e.to)! - column.get(e.from)!]).toEqual([id, 1]);
  }
});

test("000 has measured lessons and flaws; upcoming projects have neither", () => {
  expect(LEARNING["000"].learned).toHaveLength(6);
  expect(LEARNING["000"].flaws).toHaveLength(7);
  expect(LEARNING["000"].architecture.nodes.map((n) => n.id)).toEqual(["loadgen", "api", "db"]);
  for (const p of PROJECTS.filter((x) => x.status === "upcoming")) {
    expect([p.id, LEARNING[p.id].learned, LEARNING[p.id].flaws]).toEqual([p.id, null, null]);
  }
});

test("upcoming summaries are the project's own question", () => {
  for (const p of PROJECTS.slice(1)) expect(LEARNING[p.id].architecture.summary).toBe(p.question);
});
