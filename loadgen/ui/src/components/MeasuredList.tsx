import { groupRuns, oomKilled, runName, VERDICT_RULE, type Run } from "@/lib/baseline";
import { fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Achieved, Cause, Failed, GroupTitle, VerdictTag } from "./MeasuredParts";
import { RunThisButton } from "./RunThisButton";

type Props = { runs: Run[]; running: boolean; onRun: (r: Run) => void };

function Item({ run, running, onRun }: Omit<Props, "runs"> & { run: Run }) {
  const keys = [["Achieved RPS", <Achieved key="a" run={run} />], ["p99 (ms)", fmtMs(run.p99)], ["Failed", <Failed key="f" run={run} />]] as const;
  return (
    <li className={cn("flex flex-col gap-3 rounded-md border p-4", VERDICT_RULE[run.verdict])}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-ink">{runName(run)}</p>
        <VerdictTag v={run.verdict} />
      </div>
      <dl className="grid grid-cols-[1.5fr_1fr_1fr] gap-2">
        {keys.map(([k, v]) => (
          <div key={k} className="flex flex-col"><dt className="text-label text-muted-foreground">{k}</dt><dd className="font-mono">{v}</dd></div>
        ))}
      </dl>
      <p className="text-meta"><Cause run={run} /></p>
      <RunThisButton label={runName(run)} killedApi={oomKilled(run)} disabled={running} onRun={() => onRun(run)} />
    </li>
  );
}

// Below md the table becomes one card per run, grouped the same way.
export function MeasuredList({ runs, ...rest }: Props) {
  return (
    <div className="flex flex-col gap-6 md:hidden">
      {groupRuns(runs).map((g) => (
        <section key={g.op} className="flex flex-col gap-3">
          <h3><GroupTitle op={g.op} /></h3>
          <ul className="flex flex-col gap-3">{g.runs.map((r) => <Item key={r.targetRps} run={r} {...rest} />)}</ul>
        </section>
      ))}
    </div>
  );
}
