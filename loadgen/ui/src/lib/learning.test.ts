import { expect, test } from "vitest";
import { unitsOf } from "./arch";
import { LESSONS, type Lesson } from "./learning";
import { PROJECTS } from "./projects";
import { refsIn } from "./refs";

const PROSE = ["story", "changed", "learned", "summary", "flaws"] as const;
const paragraphs = (l: Lesson) => [...PROSE.flatMap((k) => l[k] ?? []), l.handsOn ?? ""];

test("every project has a Lesson and no entry is orphaned", () => {
  expect(Object.keys(LESSONS).toSorted()).toEqual(PROJECTS.map((p) => p.id));
});

test("every edge joins two existing nodes in adjacent columns, left to right", () => {
  for (const [id, { architecture: a }] of Object.entries(LESSONS)) {
    const column = new Map(unitsOf(a.nodes).flatMap((u, i) => u.nodes.map((n) => [n.id, i] as const)));
    expect(column.size, id).toBe(a.nodes.length);
    for (const e of a.edges) expect([id, column.get(e.to)! - column.get(e.from)!]).toEqual([id, 1]);
  }
});

test("000 tells the whole lecture: story, hands-on, changed, learned, summary, flaws", () => {
  const l = LESSONS["000"];
  expect([l.story.length, l.changed?.length, l.learned?.length, l.summary?.length, l.flaws?.length]).toEqual([4, 2, 4, 2, 3]);
  expect(l.handsOn).toMatch(/^Start the containers/);
  expect(l.architecture.nodes.map((n) => n.id)).toEqual(["loadgen", "api", "db"]);
});

test("upcoming projects have a one-paragraph story that references an earlier project, and nothing measured", () => {
  for (const p of PROJECTS.filter((x) => x.status === "upcoming")) {
    const l = LESSONS[p.id];
    expect([p.id, l.story.length, l.handsOn, l.changed, l.learned, l.summary, l.flaws]).toEqual([p.id, 1, null, null, null, null, null]);
    expect(refsIn(l.story[0]).every((r) => r < p.id), p.id).toBe(true);
    expect(refsIn(l.story[0]).length, p.id).toBeGreaterThan(0);
  }
});

test("every [[id]] reference points at an existing project", () => {
  const ids = new Set(PROJECTS.map((p) => p.id));
  for (const [id, l] of Object.entries(LESSONS)) {
    for (const r of paragraphs(l).flatMap(refsIn)) expect([id, ids.has(r)]).toEqual([id, true]);
  }
});

test("upcoming summaries are the project's own question", () => {
  for (const p of PROJECTS.slice(1)) expect(LESSONS[p.id].architecture.summary).toBe(p.question);
});
