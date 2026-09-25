import { detailLine, OP_TITLE, oomKilled, runName, VERDICT_RULE, type Run } from "@/lib/baseline";
import { fmtInt, fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Achieved, Cause, Failed, VerdictTag } from "./MeasuredParts";
import { RunThisButton } from "./RunThisButton";

const NUM = "px-2 text-right font-mono whitespace-nowrap";

type Props = { run: Run; cpuQuota: number; running: boolean; onRun: (r: Run) => void };

// Main line plus a muted detail line; the rule sits under the pair only.
export function MeasuredRow({ run, cpuQuota, running, onRun }: Props) {
  const rule = cn("pl-3 pr-2", VERDICT_RULE[run.verdict]);
  return (
    <>
      <tr className="align-baseline">
        <td className={cn(rule, "pt-3 font-medium text-ink")}>{OP_TITLE[run.op]}</td>
        <td className={cn(NUM, "pt-3")}>{fmtInt(run.targetRps)}</td>
        <td className={cn(NUM, "pt-3")}><Achieved run={run} /></td>
        <td className={cn(NUM, "pt-3")}>{fmtMs(run.p99)}</td>
        <td className={cn(NUM, "pt-3")}><Failed run={run} /></td>
        <td className="px-2 pt-3"><VerdictTag v={run.verdict} /></td>
        <td className="min-w-[16rem] px-2 pt-3"><Cause run={run} /></td>
        <td rowSpan={2} className="border-b py-2 pl-2 align-top">
          <RunThisButton label={runName(run)} killedApi={oomKilled(run)} disabled={running} onRun={() => onRun(run)} />
        </td>
      </tr>
      <tr className="border-b">
        <td className={rule} />
        <td colSpan={6} className="px-2 pt-1 pb-3 font-mono text-label text-muted-foreground">{detailLine(run, cpuQuota)}</td>
      </tr>
    </>
  );
}
