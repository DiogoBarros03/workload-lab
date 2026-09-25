import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { groupRuns, type Baseline, type Run } from "@/lib/baseline";
import { cn } from "@/lib/utils";
import { MeasuredList } from "./MeasuredList";
import { GroupTitle } from "./MeasuredParts";
import { MeasuredRow } from "./MeasuredRow";

const COLS = ["Operation", "Target RPS", "Achieved RPS", "p99 (ms)", "Failed", "Verdict", "What limited it"];

type Props = { baseline: Baseline; running: boolean; onRun: (r: Run) => void };

function MeasuredTable({ runs, cpuQuota, running, onRun }: { runs: Run[]; cpuQuota: number; running: boolean; onRun: (r: Run) => void }) {
  return (
    <table className="hidden w-full text-meta md:table">
      <thead>
        <tr className="border-b">
          {COLS.map((c, i) => <th key={c} scope="col" className={cn("px-2 pb-2 text-sm font-medium whitespace-nowrap text-ink", i > 0 && i < 5 ? "text-right" : "text-left", i === 0 && "pl-3")}>{c}</th>)}
          <th scope="col"><span className="sr-only">Action</span></th>
        </tr>
      </thead>
      {groupRuns(runs).map((g) => (
        <tbody key={g.op}>
          <tr className="border-b"><th colSpan={8} scope="colgroup" className="pt-6 pb-2 pl-3 text-left font-normal"><GroupTitle op={g.op} /></th></tr>
          {g.runs.map((r) => <MeasuredRow key={r.targetRps} run={r} cpuQuota={cpuQuota} running={running} onRun={onRun} />)}
        </tbody>
      ))}
    </table>
  );
}

export function MeasuredCard({ baseline: { measuredAt, setup, runs }, running, onRun }: Props) {
  const shared = { runs, running, onRun };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Measured</CardTitle>
        <p className="font-mono text-meta text-muted-foreground">
          Measured {measuredAt} · {setup.durationSec} s per run · API {setup.apiCpu} CPU / {setup.apiMemMiB} MiB / pool {setup.poolMax}
        </p>
      </CardHeader>
      <CardContent>
        <MeasuredTable {...shared} cpuQuota={setup.apiCpu} />
        <MeasuredList {...shared} />
      </CardContent>
    </Card>
  );
}
