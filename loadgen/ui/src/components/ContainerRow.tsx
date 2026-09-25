import type { Container } from "@/hooks/use-status";
import { fmtBytes, fmtInt } from "@/lib/format";
import { stateOf } from "@/lib/status";
import { DbLoadPanel } from "./DbLoadPanel";
import { Gauge } from "./Gauge";
import { StatusPill } from "./StatusPill";

const cores = (v: number) => `${v.toFixed(2)} cores`;

// Throttling only means something against a quota.
function Throttled({ c }: { c: Container }) {
  if (typeof c.nrThrottled !== "number" || c.cpuQuotaCores === null) return null;
  return <span className="font-mono text-meta text-muted-foreground">throttled {fmtInt(c.nrThrottled)}</span>;
}

// Matches the two gauges' height, so the card does not jump on an outage.
function Body({ c }: { c: Container }) {
  if (c.service === "db") return <DbLoadPanel c={c} />;
  if (!c.up) return <p className="flex min-h-[80px] items-center text-meta text-muted-foreground sm:min-h-[38px]">no data</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Gauge label="CPU" used={c.cpuCores} limit={c.cpuQuotaCores} fmt={cores} />
      <Gauge label="Memory" used={c.memBytes} limit={c.memMaxBytes} fmt={fmtBytes} />
    </div>
  );
}

// The server's reason is shown only when the service is not simply up.
export function ContainerRow({ c }: { c: Container }) {
  const state = stateOf(c);
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-ink">{c.service}</span>
          {state !== "up" && c.reason && <span className="font-mono text-meta text-muted-foreground">{c.reason}</span>}
        </div>
        <div className="flex items-center gap-3">
          <Throttled c={c} />
          <StatusPill health={state} />
        </div>
      </div>
      <Body c={c} />
    </li>
  );
}
