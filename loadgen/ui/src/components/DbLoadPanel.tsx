import type { Container } from "@/hooks/use-status";
import { fmtInt } from "@/lib/format";
import { dbLoad } from "@/lib/status";
import { Gauge } from "./Gauge";
import { Tag } from "./Tag";

const n = (v: number | null) => (v === null ? "–" : fmtInt(v));
const pct = (v: number | null) => (v === null ? "–" : `${(v * 100).toFixed(1)} %`);

// Requests queued for a pool connection: the baseline's bottleneck.
function Waiting({ count }: { count: number | null }) {
  if (count === null || count <= 0) return null;
  return <Tag tone="red" className="font-mono normal-case tracking-normal">+{fmtInt(count)} waiting</Tag>;
}

// Every line renders even when null, so the row height stays fixed.
export function DbLoadPanel({ c }: { c: Container }) {
  const d = dbLoad(c);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Gauge label="Connections" used={d.connUsed} limit={d.connMax} fmt={fmtInt} />
        <Gauge label="API pool" used={d.poolBusy} limit={d.poolMax} fmt={fmtInt} tag={<Waiting count={d.poolWaiting} />} />
      </div>
      <p className="font-mono text-sm text-ink-soft">
        commits/s {n(d.commitsPerSec)} · rows/s {n(d.rowsPerSec)} · cache hit {pct(d.cacheHitRatio)}
      </p>
      <p className="font-mono text-xs text-muted-foreground">
        active {n(d.activeBackends)} · waiting {n(d.waitingBackends)}
      </p>
    </div>
  );
}
