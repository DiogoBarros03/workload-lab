import type { Container } from "@/hooks/use-status";
import { fmtBytes, fmtInt } from "@/lib/format";
import { Gauge } from "./Gauge";
import { StatusPill } from "./StatusPill";

const cores = (v: number) => `${v.toFixed(2)} cores`;

// Throttling only means something against a quota.
function Throttled({ c }: { c: Container }) {
  if (typeof c.nrThrottled !== "number" || c.cpuQuotaCores === null) return null;
  return <span className="font-mono text-sm text-muted-foreground">throttled {fmtInt(c.nrThrottled)}</span>;
}

// The db row reports no cgroup: skip it rather than show two empty gauges.
function Usage({ c }: { c: Container }) {
  if (c.cpuCores === null && c.memBytes === null) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Gauge label="CPU" used={c.cpuCores} limit={c.cpuQuotaCores} fmt={cores} />
      <Gauge label="Memory" used={c.memBytes} limit={c.memMaxBytes} fmt={fmtBytes} />
    </div>
  );
}

export function ContainerRow({ c }: { c: Container }) {
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-ink">{c.service}</span>
        <div className="flex items-center gap-3">
          <Throttled c={c} />
          <StatusPill up={c.up} />
        </div>
      </div>
      <Usage c={c} />
    </li>
  );
}
