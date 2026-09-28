import { expect, test } from "vitest";
import baselineJson from "../../../../results/000-baseline.json";
import { unitsOf } from "./arch";
import { parseBaseline, verdictFor } from "./baseline";
import { LESSONS, type Lesson } from "./learning";
import { PROJECTS } from "./projects";
import { inlineParts, refsIn } from "./refs";

const PROSE = ["story", "changed", "learned", "summary", "flaws"] as const;
const paragraphs = (l: Lesson) => [...PROSE.flatMap((k) => l[k] ?? []), l.handsOn ?? "", ...l.quick.map((q) => q.note)];

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
  expect(l.handsOn).toMatch(/^\*\*Start the containers\*\*/);
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

test("emphasis policy: one italic per story, at most two bold and one italic per paragraph, no literal markers", () => {
  for (const [id, l] of Object.entries(LESSONS)) {
    for (const p of paragraphs(l).filter((x) => x !== "")) {
      const parts = inlineParts(p);
      const count = (kind: string) => parts.filter((x) => x.kind === kind).length;
      expect([id, count("strong") <= 2, count("em") <= 1], p).toEqual([id, true, true]);
      expect(parts.some((x) => x.kind === "text" && /\*\*|(^|\W)_|_(\W|$)/.test(x.text)), p).toBe(false);
    }
    expect(l.story.flatMap(inlineParts).filter((x) => x.kind === "em").length, id).toBe(l.story.length);
    expect(l.story.flatMap(inlineParts).some((x) => x.kind === "strong"), id).toBe(true);
  }
});

test("000 quick tests: five presets, each matching a measured run, notes as short prose", () => {
  const quick = LESSONS["000"].quick;
  const baseline = parseBaseline(baselineJson);
  expect(quick.map((q) => [q.label, q.op, q.rps, q.durationSec])).toEqual([
    ["Read 1 000", "read", 1000, 20], ["Write 1 000", "write", 1000, 20], ["Mixed 1 000", "mixed", 1000, 20],
    ["Read 5 000", "read", 5000, 20], ["Write 3 000", "write", 3000, 20],
  ]);
  expect(quick.map((q) => verdictFor(q, baseline))).toEqual(["ok", "degraded", "ok", "failed", "failed"]);
  for (const q of quick) {
    expect(q.note, q.label).not.toMatch(/^\s*[-*•]\s|\n/m);
    expect(refsIn(q.note).length, q.label).toBeLessThanOrEqual(1);
  }
});

test("upcoming projects have no quick tests yet", () => {
  for (const p of PROJECTS.slice(1)) expect(LESSONS[p.id].quick).toEqual([]);
});
