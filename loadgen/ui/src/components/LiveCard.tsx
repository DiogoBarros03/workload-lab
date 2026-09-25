import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtInt, fmtMs, fmtSec } from "@/lib/format";
import type { Progress, RunState } from "@/lib/run";
import { LiveChart } from "./LiveChart";
import { ProgressBar } from "./ProgressBar";
import { Stat } from "./Stat";

// Before the first progress event the server is still seeding.
function Counters({ p, total }: { p: Progress | null; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      <ProgressBar done={p ? p.done : 0} total={total} />
      <p className="font-mono text-sm text-muted-foreground">
        {p ? `${fmtInt(p.done)} / ${fmtInt(total)} · ${fmtInt(p.inFlight)} in flight · ${fmtSec(p.elapsedMs)}` : "Seeding the database."}
      </p>
    </div>
  );
}

// The window field is optional in the contract; no window renders dashes.
function WindowStats({ p }: { p: Progress | null }) {
  const w = p?.window;
  return (
    <div className="grid grid-cols-2 gap-6">
      <Stat size="lg" label="req/s, last window" value={w ? fmtInt(w.rps) : "–"} />
      <Stat size="lg" label="p99, last window" value={fmtMs(w ? w.p99 : null)} unit="ms" />
    </div>
  );
}

export function LiveCard({ run, className }: { run: RunState; className?: string }) {
  if (!run.config) return null;
  return (
    <Card className={className}>
      <CardHeader><CardTitle>Live</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Counters p={run.progress} total={run.config.requests} />
        <WindowStats p={run.progress} />
        <LiveChart series={run.series} />
      </CardContent>
    </Card>
  );
}
