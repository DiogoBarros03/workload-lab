import type { ArchEdge, ArchNode } from "./learning";

export const BOX_Y = 56; // leaves room for a group label above the boxes
const FLAT_Y = 28;
export const BOX_H = 64;
const PAD = 16;
const GROUP_PAD = 16;
const INNER_GAP = 16;
const MIN_GAP = 64;
const LABEL_CH = 8.4; // average advance of 15px sans
const MONO_CH = 7.8; // advance of 13px mono

export type Unit = { group?: string; nodes: ArchNode[] };
export type Box = { node: ArchNode; x: number; y: number; w: number; h: number };
export type GroupBox = { name: string; x: number; y: number; w: number; h: number };
export type Layout = { boxes: Box[]; groups: GroupBox[]; units: { x: number; w: number }[]; width: number; height: number };
export type EdgeLine = { x1: number; x2: number; y: number; label?: string };

export const monoWidth = (text: string) => Math.ceil(text.length * MONO_CH);
export const tagWidth = (kind: string) => monoWidth(kind) + 12;

// Consecutive nodes sharing a group form one column of the diagram.
export function unitsOf(nodes: readonly ArchNode[]): Unit[] {
  return nodes.reduce<Unit[]>((units, node) => {
    const last = units.at(-1);
    if (node.group !== undefined && last?.group === node.group) return [...units.slice(0, -1), { ...last, nodes: [...last.nodes, node] }];
    return [...units, { group: node.group, nodes: [node] }];
  }, []);
}

const boxWidth = (n: ArchNode) =>
  Math.ceil(Math.max(n.label.length * LABEL_CH, monoWidth(n.sub ?? ""), tagWidth(n.kind), 80) + 32);

const unitOfNode = (units: Unit[]) => new Map(units.flatMap((u, i) => u.nodes.map((n) => [n.id, i] as const)));

function indexOf(index: Map<string, number>, id: string): number {
  const i = index.get(id);
  if (i === undefined) throw new Error(`architecture: edge references unknown node ${id}`);
  return i;
}

// Gap before each column, wide enough for the longest edge label entering it.
function gapsBefore(units: Unit[], edges: readonly ArchEdge[]): number[] {
  const index = unitOfNode(units);
  return units.map((_, i) => {
    const labels = edges.filter((e) => indexOf(index, e.to) === i && e.label !== undefined).map((e) => monoWidth(e.label!) + 32);
    return i === 0 ? PAD : Math.max(MIN_GAP, ...labels);
  });
}

function placeUnit(u: Unit, x0: number, y: number): { boxes: Box[]; w: number } {
  const inset = u.group === undefined ? 0 : GROUP_PAD;
  const boxes = u.nodes.reduce<Box[]>((acc, node) => {
    const prev = acc.at(-1);
    const x = prev === undefined ? x0 + inset : prev.x + prev.w + INNER_GAP;
    return [...acc, { node, x, y, w: boxWidth(node), h: BOX_H }];
  }, []);
  const last = boxes[boxes.length - 1];
  return { boxes, w: last.x + last.w + inset - x0 };
}

// Left-to-right layout in node order; grouped nodes sit side by side in a container.
export function layoutNodes(nodes: readonly ArchNode[], edges: readonly ArchEdge[] = []): Layout {
  const units = unitsOf(nodes);
  const gaps = gapsBefore(units, edges);
  const top = units.some((u) => u.group !== undefined) ? BOX_Y : FLAT_Y;
  const placed = units.reduce<{ x: number; w: number; boxes: Box[] }[]>((acc, u, i) => {
    const prev = acc.at(-1);
    const x = (prev === undefined ? 0 : prev.x + prev.w) + gaps[i];
    return [...acc, { x, ...placeUnit(u, x, top) }];
  }, []);
  const groups = units.flatMap((u, i) =>
    u.group === undefined ? [] : [{ name: u.group, x: placed[i].x, y: BOX_Y - 44, w: placed[i].w, h: BOX_H + 60 }]);
  const end = placed[placed.length - 1];
  return {
    boxes: placed.flatMap((p) => p.boxes), groups, units: placed.map(({ x, w }) => ({ x, w })),
    width: end.x + end.w + PAD, height: top + BOX_H + 28,
  };
}

// One line per pair of joined columns, from the right side of one to the left of the next.
export function edgeLines(layout: Layout, edges: readonly ArchEdge[]): EdgeLine[] {
  const index = unitOfNode(unitsOf(layout.boxes.map((b) => b.node)));
  const pairs = edges.map((e) => {
    const [f, t] = [indexOf(index, e.from), indexOf(index, e.to)];
    return { e, f, t, key: `${f}-${t}` };
  });
  return pairs
    .filter((p, i) => pairs.findIndex((q) => q.key === p.key) === i)
    .map(({ e, f, t }) => ({
      x1: layout.units[f].x + layout.units[f].w, x2: layout.units[t].x, y: layout.boxes[0].y + BOX_H / 2,
      ...(e.label === undefined ? {} : { label: e.label }),
    }));
}
