import { sentence } from "@/lib/format";
import { failedCount, OP_NOTE, OP_TITLE, oomKilled, shortfallPct, VERDICT_LABEL, verdictTone, type Run, type Verdict } from "@/lib/baseline";
import { fmtInt } from "@/lib/format";
import type { Op } from "@/lib/run";
import { cn } from "@/lib/utils";
import { Tag } from "./Tag";

export function GroupTitle({ op }: { op: Op }) {
  return (
    <>
      <span className="font-serif text-lg text-ink">{OP_TITLE[op]}</span>
      <span className="ml-3 text-sm font-normal text-muted-foreground">{OP_NOTE[op]}</span>
    </>
  );
}

export const VerdictTag = ({ v }: { v: Verdict }) => <Tag tone={verdictTone(v)} className="normal-case tracking-normal">{VERDICT_LABEL[v]}</Tag>;

export function Achieved({ run }: { run: Run }) {
  const short = shortfallPct(run);
  return <span className="whitespace-nowrap">{fmtInt(run.achievedRps)}{short !== null && <span className="ml-1 text-label text-muted-foreground">(−{short} %)</span>}</span>;
}

export function Failed({ run }: { run: Run }) {
  const n = failedCount(run);
  return <span className={cn(n === 0 && "text-muted-foreground")}>{fmtInt(n)}</span>;
}

export function Cause({ run }: { run: Run }) {
  return (
    <>
      {oomKilled(run) && <Tag tone="red" className="mr-1.5 normal-case tracking-normal">OOM-killed</Tag>}
      {sentence(run.cause)}
    </>
  );
}
