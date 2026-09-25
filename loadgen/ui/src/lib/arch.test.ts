import { expect, test } from "vitest";
import { BOX_H, BOX_Y, edgeLines, layoutNodes, unitsOf } from "./arch";
import type { ArchNode } from "./learning";

const n = (id: string, group?: string): ArchNode => ({ id, label: id, kind: "service", group });
const NODES = [n("lb"), n("a", "Replicas"), n("b", "Replicas"), n("c", "Replicas"), n("db")];

test("unitsOf merges consecutive nodes of one group into a single column", () => {
  expect(unitsOf(NODES).map((u) => [u.group, u.nodes.map((x) => x.id)])).toEqual([
    [undefined, ["lb"]], ["Replicas", ["a", "b", "c"]], [undefined, ["db"]],
  ]);
});

test("unitsOf keeps a group that reappears later as a separate column", () => {
  expect(unitsOf([n("a", "G"), n("x"), n("b", "G")])).toHaveLength(3);
});

test("layoutNodes places boxes left to right without overlap, in node order", () => {
  const { boxes } = layoutNodes(NODES);
  expect(boxes.map((b) => b.node.id)).toEqual(["lb", "a", "b", "c", "db"]);
  boxes.slice(1).forEach((b, i) => expect(b.x).toBeGreaterThan(boxes[i].x + boxes[i].w));
  for (const b of boxes) expect([b.y, b.h]).toEqual([BOX_Y, BOX_H]);
});

test("grouped nodes share one container that encloses them, and it sets the canvas size", () => {
  const { boxes, groups, width, height } = layoutNodes(NODES);
  expect(groups.map((g) => g.name)).toEqual(["Replicas"]);
  const [g] = groups;
  for (const b of boxes.slice(1, 4)) {
    expect(b.x).toBeGreaterThan(g.x);
    expect(b.x + b.w).toBeLessThan(g.x + g.w);
    expect(b.y).toBeGreaterThan(g.y);
    expect(b.y + b.h).toBeLessThan(g.y + g.h);
  }
  expect(boxes[0].x + boxes[0].w).toBeLessThan(g.x);
  expect(boxes[4].x).toBeGreaterThan(g.x + g.w);
  expect(width).toBeGreaterThan(boxes[4].x + boxes[4].w);
  expect(height).toBeGreaterThan(g.y + g.h);
  expect(height).toBeGreaterThanOrEqual(120);
});

test("without groups the boxes move up and the canvas is shorter", () => {
  const flat = layoutNodes([n("a"), n("b")]);
  expect(flat.boxes[0].y).toBeLessThan(BOX_Y);
  expect(flat.height).toBeLessThan(layoutNodes(NODES).height);
  expect(flat.height).toBeGreaterThanOrEqual(120);
});

test("longer text widens a box", () => {
  const [short, long] = layoutNodes([n("a"), { ...n("b"), sub: "Fastify · 0.5 CPU · 128 MiB · pool 10" }]).boxes;
  expect(long.w).toBeGreaterThan(short.w);
});

test("edgeLines joins column edges once per column pair and keeps the first label", () => {
  const layout = layoutNodes(NODES);
  const lines = edgeLines(layout, [
    { from: "lb", to: "a", label: "HTTP" }, { from: "lb", to: "b" }, { from: "c", to: "db", label: "SQL" },
  ]);
  const [g] = layout.groups;
  expect(lines).toEqual([
    { x1: layout.boxes[0].x + layout.boxes[0].w, x2: g.x, y: BOX_Y + BOX_H / 2, label: "HTTP" },
    { x1: g.x + g.w, x2: layout.boxes[4].x, y: BOX_Y + BOX_H / 2, label: "SQL" },
  ]);
});

test("edgeLines throws on an edge to an unknown node", () => {
  expect(() => edgeLines(layoutNodes(NODES), [{ from: "lb", to: "nope" }])).toThrow("nope");
});

test("a long edge label widens the gap it sits in", () => {
  const narrow = layoutNodes([n("a"), n("b")], []);
  const wide = layoutNodes([n("a"), n("b")], [{ from: "a", to: "b", label: "a much longer edge label here" }]);
  expect(wide.boxes[1].x - wide.boxes[0].x).toBeGreaterThan(narrow.boxes[1].x - narrow.boxes[0].x);
});
