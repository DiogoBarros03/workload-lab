import { edgeLines, layoutNodes, tagWidth, type Box, type EdgeLine, type GroupBox } from "@/lib/arch";
import type { ArchKind, Architecture } from "@/lib/learning";

export const TAG: Record<ArchKind, { title: string; bg: string; fg: string }> = {
  load: { title: "Load", bg: "var(--blue-bg)", fg: "var(--blue-fg)" },
  service: { title: "Service", bg: "var(--green-bg)", fg: "var(--green-fg)" },
  store: { title: "Store", bg: "var(--yellow-bg)", fg: "var(--yellow-fg)" },
  infra: { title: "Infra", bg: "var(--track)", fg: "var(--ink-soft)" },
};
const MUTED = "var(--ink-muted)";
const MONO = { fontFamily: "var(--font-mono)", fontSize: 13 };

function NodeBox({ b }: { b: Box }) {
  const tag = TAG[b.node.kind];
  const sub = b.node.sub;
  return (
    <g>
      <rect x={b.x + 0.5} y={b.y + 0.5} width={b.w - 1} height={b.h - 1} rx={8} fill="var(--canvas)" stroke={MUTED} />
      <rect x={b.x + 12} y={b.y - 10} width={tagWidth(tag.title)} height={20} rx={4} fill="var(--canvas)" />
      <rect x={b.x + 12} y={b.y - 10} width={tagWidth(tag.title)} height={20} rx={4} fill={tag.bg} />
      <text x={b.x + 18} y={b.y + 4} fill={tag.fg} style={MONO}>{tag.title}</text>
      <text x={b.x + 16} y={b.y + (sub ? 32 : 40)} fill="var(--ink)" style={{ fontFamily: "var(--font-sans)", fontSize: 15 }}>{b.node.label}</text>
      {sub && <text x={b.x + 16} y={b.y + 52} fill={MUTED} style={MONO}>{sub}</text>}
    </g>
  );
}

export function Group({ g }: { g: GroupBox }) {
  return (
    <g>
      <rect x={g.x + 0.5} y={g.y + 0.5} width={g.w - 1} height={g.h - 1} rx={8} fill="none" stroke={MUTED} strokeDasharray="4 4" />
      <text x={g.x + 12} y={g.y + 20} fill={MUTED} style={MONO}>{g.name}</text>
    </g>
  );
}

function Edge({ e }: { e: EdgeLine }) {
  return (
    <g>
      <line x1={e.x1} x2={e.x2 - 2} y1={e.y + 0.5} y2={e.y + 0.5} stroke={MUTED} markerEnd="url(#arch-arrow)" />
      {e.label && <text x={(e.x1 + e.x2) / 2} y={e.y - 8} textAnchor="middle" fill={MUTED} style={MONO}>{e.label}</text>}
    </g>
  );
}

// Inline SVG at its natural size; narrow screens scroll it rather than shrink the text.
export function ArchDiagram({ architecture: a }: { architecture: Architecture }) {
  const layout = layoutNodes(a.nodes, a.edges);
  const label = `Architecture diagram: ${a.nodes.map((n) => n.label).join(", ")}. ${a.summary}`;
  return (
    <div className="overflow-x-auto">
      <svg role="img" aria-label={label} viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} className="block min-h-[120px] max-w-none">
        <defs>
          <marker id="arch-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={8} markerHeight={8} orient="auto">
            <path d="M0 0 L8 4 L0 8 Z" fill={MUTED} />
          </marker>
        </defs>
        {layout.groups.map((g) => <Group key={g.name + g.x} g={g} />)}
        {edgeLines(layout, a.edges).map((e) => <Edge key={e.x1} e={e} />)}
        {layout.boxes.map((b) => <NodeBox key={b.node.id} b={b} />)}
      </svg>
    </div>
  );
}
