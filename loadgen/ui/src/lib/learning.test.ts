import { expect, test } from "vitest";
import { layoutNodes, unitsOf } from "./arch";
import { verdictFor } from "./baseline";
import { datasetFor } from "./datasets";
import { LESSONS, type Lesson } from "./learning";
import { PROJECTS } from "./projects";
import { inlineParts, refsIn } from "./refs";

const PROSE = ["story", "changed", "learned", "summary", "flaws"] as const;
const paragraphs = (l: Lesson) => [...PROSE.flatMap((k) => l[k] ?? []), l.handsOn ?? "", l.onKubernetes ?? "", ...l.quick.map((q) => q.note)];
const upcoming = PROJECTS.filter((x) => x.status === "upcoming");

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
  expect(l.measured).toBe("000-baseline");
  expect(l.onKubernetes).toMatch(/^The same runs on the Kubernetes cluster that \[\[001\]\] introduces .* `results\/000-k8s\.md`\.$/);
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
  for (const p of upcoming) expect(LESSONS[p.id].architecture.summary).toBe(p.question);
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
  const baseline = datasetFor("000-baseline");
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

test("upcoming projects have no quick tests and no measured dataset yet", () => {
  for (const p of upcoming) expect([LESSONS[p.id].quick, LESSONS[p.id].measured]).toEqual([[], null]);
});

test("only 000 carries an on-Kubernetes note", () => {
  for (const [id, l] of Object.entries(LESSONS)) if (id !== "000") expect([id, l.onKubernetes]).toEqual([id, null]);
});

test("001 tells the whole lecture on its own dataset", () => {
  const l = LESSONS["001"];
  expect([l.story.length, l.changed?.length, l.learned?.length, l.summary?.length, l.flaws?.length, l.measured]).toEqual([2, 2, 4, 2, 3, "001-sidecar"]);
  expect(l.story[0]).toMatch(/^In \[\[000\]\] we saw that a single API container/);
  expect(l.story[1]).toMatch(/^This is also the first project that runs on \*\*Kubernetes\*\*\./);
  expect(l.handsOn).toMatch(/^\*\*Create the cluster\*\* if it is not running/);
  expect(l.learned?.[1]).toMatch(/^A sidecar sees the \*\*process, not the kernel's accounting\*\*/);
});

test("001 architecture: api and sidecar share the Pod group, both reach the db", () => {
  const a = LESSONS["001"].architecture;
  expect(a.nodes.map((n) => [n.id, n.kind, n.group])).toEqual([["loadgen", "load", undefined], ["api", "service", "Pod"], ["sidecar", "infra", "Pod"], ["db", "store", undefined]]);
  expect(a.nodes.find((n) => n.id === "sidecar")?.label).toBe("stats-sidecar");
  expect(a.edges).toEqual([
    { from: "loadgen", to: "api", label: "HTTP" }, { from: "api", to: "db", label: "11 connections" },
    { from: "sidecar", to: "db", label: "SQL, 1 connection" },
  ]);
  expect(unitsOf(a.nodes).map((u) => u.group)).toEqual([undefined, "Pod", undefined]);
});

test("001 quick tests: five presets matching measured sidecar runs, verdicts from its dataset", () => {
  const quick = LESSONS["001"].quick;
  expect(quick.map((q) => [q.label, q.op, q.rps, q.durationSec])).toEqual([
    ["Read 1 000", "read", 1000, 20], ["Write 1 000", "write", 1000, 20], ["Mixed 1 000", "mixed", 1000, 20],
    ["Read 5 000", "read", 5000, 20], ["Write 3 000", "write", 3000, 20],
  ]);
  expect(quick.map((q) => verdictFor(q, datasetFor("001-sidecar")))).toEqual(["ok", "failed", "ok", "degraded", "failed"]);
});

test("every built quick-test note opens with the word its verdict dot shows", () => {
  const OPENER = { ok: /^Comfortable\./, degraded: /^Degraded\./, failed: /^Fail(s|ed once)\./ };
  for (const [id, key] of [["000", "000-baseline"], ["001", "001-sidecar"]] as const) {
    for (const q of LESSONS[id].quick) {
      const v = verdictFor(q, datasetFor(key));
      if (v === null) throw new Error(`${id} ${q.label} has no measured run`);
      expect(q.note).toMatch(OPENER[v]);
    }
  }
});

test("000 and 001 static diagrams fit the 1104 px content column", () => {
  const widths = (["000", "001"] as const).map((id) => layoutNodes(LESSONS[id].architecture.nodes, LESSONS[id].architecture.edges).width);
  expect(widths.map((w) => (w <= 1104 ? "fits" : w))).toEqual(["fits", "fits"]);
});
