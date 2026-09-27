import { tagWidth, type Box } from "@/lib/arch";
import type { NodeReadout } from "@/lib/live";
import { fmtInt, fmtMs } from "@/lib/format";
import type { Health } from "@/lib/status";
import { TAG } from "../ArchDiagram";
import { Meter } from "./Meter";
import { Sparkline } from "./Sparkline";

const PILL: Record<Health, { text: string; bg: string; fg: string }> = {
  up: { text: "UP", bg: "var(--green-bg)", fg: "var(--green-fg)" },
  slow: { text: "SLOW", bg: "var(--yellow-bg)", fg: "var(--yellow-fg)" },
  down: { text: "ERROR", bg: "var(--red-bg)", fg: "var(--red-fg)" },
  off: { text: "OFF", bg: "var(--track)", fg: "var(--ink-soft)" },
  unknown: { text: "?", bg: "var(--track)", fg: "var(--ink-soft)" },
};
const MONO = { fontFamily: "var(--font-mono)", fontSize: 13 };
const MUTED = "var(--ink-muted)";

function Chip({ x, y, text, bg, fg }: { x: number; y: number; text: string; bg: string; fg: string }) {
  return (
    <g>
      <rect x={x} y={y} width={tagWidth(text)} height={20} rx={4} fill="var(--canvas)" />
      <rect x={x} y={y} width={tagWidth(text)} height={20} rx={4} fill={bg} />
      <text x={x + 6} y={y + 14} fill={fg} style={MONO}>{text}</text>
    </g>
  );
}

function Cell({ x, y, label, value, end }: { x: number; y: number; label: string; value: string; end?: boolean }) {
  return <text x={x} y={y} textAnchor={end ? "end" : "start"} style={MONO}><tspan fill={MUTED}>{label}</tspan><tspan dx={6} fill="var(--ink)">{value}</tspan></text>;
}

// One node: kind, name, health, busy %, p99 and queue cells, a 60 s line and a load meter.
export function NodeCard({ b, r }: { b: Box; r: NodeReadout }) {
  const pill = PILL[r.health];
  const hot = r.tone === "hot";
  return (
    <g>
      <rect x={b.x + 0.5} y={b.y + 0.5} width={b.w - 1} height={b.h - 1} rx={8} fill="var(--canvas)" stroke={hot ? "var(--bar-hot)" : MUTED} />
      <Chip x={b.x + 12} y={b.y - 10} {...TAG[b.node.kind]} text={TAG[b.node.kind].title} />
      <Chip x={b.x + b.w - 12 - tagWidth(pill.text)} y={b.y - 10} {...pill} />
      <text x={b.x + 16} y={b.y + 32} fill="var(--ink)" style={{ fontFamily: "var(--font-sans)", fontSize: 15 }}>{b.node.label}</text>
      <text x={b.x + 16} y={b.y + 64}>
        <tspan fill={r.busy === null ? MUTED : "var(--ink)"} style={{ fontFamily: "var(--font-mono)", fontSize: 24 }}>{r.busyLabel}</tspan>
        <tspan dx={8} fill={MUTED} style={{ fontFamily: "var(--font-sans)", fontSize: 13 }}>Busy</tspan>
      </text>
      <Sparkline x={b.x + b.w - 16 - 64} y={b.y + 46} values={r.sparkline} />
      <Cell x={b.x + 16} y={b.y + 88} label="p99" value={r.p99 === null ? "—" : `${fmtMs(r.p99)} ms`} />
      <Cell end x={b.x + b.w - 16} y={b.y + 88} label={r.waitingLabel} value={r.waiting === null ? "—" : fmtInt(r.waiting)} />
      <Meter x={b.x + 16} y={b.y + b.h - 14} w={b.w - 32} ratio={r.busy} tone={r.tone} />
    </g>
  );
}
