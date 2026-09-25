import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { oomKilled, verdictTone, type Baseline, type Run } from "@/lib/baseline";
import { fmtInt, fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RunThisButton } from "./RunThisButton";
import { Tag } from "./Tag";

const COLS = ["op", "target rps", "achieved rps", "p99 ms", "dropped", "errors", "peak CPU cores", "throttled periods", "pool waiting", "verdict", "cause", "action"];
const NUM = "px-1.5 text-right font-mono";

type Props = { baseline: Baseline; running: boolean; onRun: (r: Run) => void };

function Row({ run, running, onRun }: { run: Run; running: boolean; onRun: (r: Run) => void }) {
  const killed = oomKilled(run);
  const nums = [fmtInt(run.targetRps), fmtInt(run.achievedRps), fmtMs(run.p99), fmtInt(run.dropped), fmtInt(run.errors),
    run.peakCpuCores.toFixed(2), fmtInt(run.throttledPeriods), fmtInt(run.peakPoolWaiting)];
  return (
    <TableRow className="align-top">
      <TableCell className="px-1.5">{run.op}</TableCell>
      {nums.map((n, i) => <TableCell key={COLS[i + 1]} className={NUM}>{n}</TableCell>)}
      <TableCell className="px-1.5"><Tag tone={verdictTone(run.verdict)}>{run.verdict}</Tag></TableCell>
      <TableCell className="min-w-[11rem] px-1.5 whitespace-normal">
        {killed && <Tag tone="red" className="mr-1.5 normal-case">OOM-killed</Tag>}
        {run.cause}
      </TableCell>
      <TableCell>
        <RunThisButton label={`${run.op} at ${run.targetRps} rps`} killedApi={killed} disabled={running} onRun={() => onRun(run)} />
      </TableCell>
    </TableRow>
  );
}

export function MeasuredCard({ baseline: { measuredAt, setup, runs }, running, onRun }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Measured</CardTitle>
        <p className="font-mono text-meta text-muted-foreground">
          measured {measuredAt} · {setup.durationSec} s per run · api {setup.apiCpu} CPU / {setup.apiMemMiB} MiB / pool {setup.poolMax}
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>{COLS.map((c, i) => <TableHead key={c} className={cn("px-1.5 align-bottom leading-tight whitespace-normal", i > 0 && i < 9 && "text-right")}>{c === "action" ? <span className="sr-only">{c}</span> : c}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>{runs.map((r) => <Row key={`${r.op}-${r.targetRps}`} run={r} running={running} onRun={onRun} />)}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
