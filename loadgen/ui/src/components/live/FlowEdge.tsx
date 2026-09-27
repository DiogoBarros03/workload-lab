import type { EdgeLine } from "@/lib/arch";
import { bucketRps, edgeFlow, type EdgeReadout } from "@/lib/live";

const MONO = { fontFamily: "var(--font-mono)", fontSize: 13 };

// A static arrow, with marching dashes on top sized and timed by the rate.
export function FlowEdge({ line, readout, quiet }: { line: EdgeLine; readout: EdgeReadout; quiet: boolean }) {
  // Bucketed so the dash animation restarts only when the rate crosses a step.
  const flow = edgeFlow(bucketRps(readout.rps));
  const active = !quiet && flow.active;
  const tone = readout.danger && active ? "var(--bar-hot)" : "var(--ink-soft)";
  const y = line.y + 0.5;
  return (
    <g>
      <line x1={line.x1} x2={line.x2 - 2} y1={y} y2={y} stroke="var(--ink-muted)" markerEnd="url(#live-arrow)" />
      {active && (
        <path
          d={`M${line.x1} ${y} H${line.x2 - 10}`} className="live-flow" fill="none" stroke={tone}
          strokeWidth={flow.width} strokeDasharray={`3 ${flow.gap}`}
          style={{ animationDuration: `${flow.durationSec}s`, ["--live-period" as string]: `${3 + flow.gap}px` }}
        />
      )}
      {active && <text x={(line.x1 + line.x2) / 2} y={line.y - 10} textAnchor="middle" fill={tone} style={MONO}>{readout.label}</text>}
    </g>
  );
}
