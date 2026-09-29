import { useEffect, useState } from "react";
import type { StatusState } from "@/hooks/use-status";
import { edgeRoutes, layoutNodes } from "@/lib/arch";
import type { Architecture } from "@/lib/learning";
import { edgeFlow, edgeReadout, idle, nodeReadout, type EdgeReadout, type LiveStatus, type NodeReadout } from "@/lib/live";
import type { Progress, RunState } from "@/lib/run";
import type { Health, Service } from "@/lib/status";
import { Group } from "./ArchDiagram";
import { FlowEdge } from "./live/FlowEdge";
import { NodeCard } from "./live/NodeCard";

export type LiveArchDiagramProps = {
  architecture: Architecture; run: RunState; status: StatusState; health: Record<Service, Health>; now?: number;
};

const CARD = { boxH: 130, minBoxW: 208 };
// Cards omit the sub line; gaps are sized for a rate label, not the static one.
const RATE_WIDEST = "88 888/s";

// Wall clock ticking once a second, unless a fixed time is given.
function useClock(fixed: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [fixed]);
  return fixed ?? now;
}

// When the latest progress event arrived, to the clock's second.
function useArrival(progress: Progress | null, now: number) {
  const at = progress === null ? null : now;
  const [seen, setSeen] = useState({ progress, at });
  if (seen.progress !== progress) setSeen({ progress, at });
  return seen.progress === progress ? seen.at : at;
}

// Per node "<name> <health> <busy %>", then the first edge's rate while traffic flows.
function summary(a: Architecture, r: Map<string, NodeReadout>, traffic: EdgeReadout | null) {
  const nodes = a.nodes.map((n) => `${n.label} ${r.get(n.id)!.health} ${r.get(n.id)!.busyLabel}`);
  const parts = traffic === null ? nodes : [...nodes, `traffic ${traffic.label}`];
  return `Live architecture: ${parts.join("; ")}.`;
}

// The architecture with live load on each node and the request rate along each edge.
export function LiveArchDiagram({ architecture: a, run, status, health, now }: LiveArchDiagramProps) {
  const clock = useClock(now);
  const quiet = idle(run, useArrival(run.progress, clock), clock);
  const live: RunState = quiet ? { ...run, progress: null } : run;
  const s: LiveStatus = { containers: status.containers, apiCpu: status.apiCpu, dbLoad: status.dbLoad, health };
  const layout = layoutNodes(a.nodes.map((n) => ({ ...n, sub: undefined })), a.edges.map((e) => ({ ...e, label: RATE_WIDEST })), CARD);
  const readouts = new Map(a.nodes.map((n) => [n.id, nodeReadout(n.id, live, s)]));
  const first = a.edges.length ? edgeReadout(a.edges[0], live, s) : null;
  const traffic = first !== null && !quiet && edgeFlow(first.rps).active ? first : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <svg role="img" aria-label={summary(a, readouts, traffic)} viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} className="block max-w-none">
          <defs>
            <marker id="live-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={8} markerHeight={8} orient="auto">
              <path d="M0 0 L8 4 L0 8 Z" fill="var(--ink-muted)" />
            </marker>
          </defs>
          {layout.groups.map((g) => <Group key={g.name + g.x} g={g} />)}
          {edgeRoutes(layout, a.edges).map(({ edge, line }) => <FlowEdge key={line.x1} line={line} readout={edgeReadout(edge, live, s)} quiet={quiet} />)}
          {layout.boxes.map((b) => <NodeCard key={b.node.id} b={b} r={readouts.get(b.node.id)!} />)}
        </svg>
      </div>
      <p className="text-label text-muted-foreground">
        {quiet ? "Idle · start a run to see traffic" : "Live · updated every 500 ms during a run, containers every 2 s"}
      </p>
    </div>
  );
}
