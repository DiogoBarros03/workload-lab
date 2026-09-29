import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtInt, fmtMs, fmtSec } from "@/lib/format";
import { INITIAL_FORM, progressFraction, type Progress, type RunConfig, type RunState } from "@/lib/run";
import { LiveChart } from "./LiveChart";
import { Notice } from "./Notice";
import { ProgressBar } from "./ProgressBar";
import { Stat } from "./Stat";
import { Tag } from "./Tag";

// Before the first progress event the server is still preparing the run.
function Counters({ p, config }: { p: Progress | null; config: RunConfig }) {
  const errors = p?.window?.errors ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <ProgressBar fraction={p ? progressFraction(p.elapsedMs, config.durationSec) : 0} failing={errors > 0} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-meta text-muted-foreground">
          {p
            ? `${fmtSec(p.elapsedMs)} / ${config.durationSec} s · in flight ${fmtInt(p.inFlight)} · dropped ${fmtInt(p.dropped)}`
            : "Preparing the run."}
        </p>
        {errors > 0 && <Tag tone="red" className="font-mono">errors {fmtInt(errors)}</Tag>}
      </div>
    </div>
  );
}

// The window field is optional in the contract; no window renders dashes.
function WindowStats({ p, target }: { p: Progress | null; target: number }) {
  const w = p?.window;
  return (
    <div className="grid grid-cols-2 gap-6">
      <Stat size="lg" label="Last window RPS" value={w ? fmtInt(w.rps) : "–"} unit={`/ ${fmtInt(target)} target`} />
      <Stat size="lg" label="Last window p99" value={fmtMs(w ? w.p99 : null)} unit="ms" />
    </div>
  );
}

// Before any run: axes only, sized like the default run, so the row never looks empty.
function Idle() {
  return (
    <>
      <p className="text-meta text-muted-foreground">Start a run to see throughput and latency here.</p>
      <LiveChart series={[]} target={0} durationSec={Number(INITIAL_FORM.duration)} />
    </>
  );
}

export function LiveCard({ run, className }: { run: RunState; className?: string }) {
  if (!run.config) {
    return (
      <Card className={className}>
        <CardHeader><CardTitle>Live</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-6"><Idle /></CardContent>
      </Card>
    );
  }
  return (
    <Card className={className}>
      <CardHeader><CardTitle>Live</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Counters p={run.progress} config={run.config} />
        {run.phase === "error" && <Notice error={run.message} note={null} />}
        <WindowStats p={run.progress} target={run.config.rps} />
        <LiveChart series={run.series} target={run.config.rps} durationSec={run.config.durationSec} />
      </CardContent>
    </Card>
  );
}
