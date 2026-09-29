import { CaretRight } from "@phosphor-icons/react";
import { useState } from "react";
import { groupRuns, measuredCaption, type Baseline, type Run } from "@/lib/baseline";
import type { QuickTest } from "@/lib/learning";
import { cn } from "@/lib/utils";
import { MeasuredList } from "./MeasuredList";
import { GroupTitle } from "./MeasuredParts";
import { MeasuredRow } from "./MeasuredRow";
import { Prose, RichText } from "./ProseSection";
import { QuickLabel } from "./QuickTests";

const COLS = ["Operation", "Target RPS", "Achieved RPS", "p99 (ms)", "Failed", "Verdict", "What limited it"];
const OPEN_KEY = "loadlab.measured.open";
const INTRO =
  "Each quick test above matches one of the runs below, recorded on this exact stack. The table shows what each rate achieved and _what limited it_; the notes point to the project that addresses each limit rather than explaining it here.";
const SUMMARY =
  "flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-6 py-4 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden";

// footnote closes the block, e.g. the same runs repeated on another platform.
type Props = { baseline: Baseline; quick: QuickTest[]; footnote: string | null; running: boolean; onRun: (r: Run) => void };

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

// Storage may be absent or blocked; that only costs remembering the open state.
function useStoredOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => {
    try { return window.localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; }
  });
  const toggle = (next: boolean) => {
    setOpen(next);
    try { window.localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch { /* not remembered */ }
  };
  return [open, toggle];
}

const QuickNotes = ({ quick }: { quick: QuickTest[] }) => (
  <dl className="grid max-w-prose grid-cols-[max-content_1fr] items-baseline gap-x-4 gap-y-2">
    {quick.map((q) => (
      <div key={q.label} className="contents">
        <dt className="text-label font-medium whitespace-nowrap text-ink"><QuickLabel label={q.label} /><span aria-hidden className="text-muted-foreground"> —</span></dt>
        <dd className="text-meta"><RichText text={q.note} /></dd>
      </div>
    ))}
  </dl>
);

export function MeasuredCard({ baseline, quick, footnote, running, onRun }: Props) {
  const { measuredAt, setup, runs } = baseline;
  const [open, setOpen] = useStoredOpen();
  const shared = { runs, running, onRun };
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group rounded-lg border bg-card text-card-foreground">
      <summary className={SUMMARY}>
        <CaretRight weight="bold" aria-hidden className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
        <span className="font-serif text-xl text-ink">More About These Tests</span>
        <span className="ml-auto text-label text-muted-foreground">{runs.length} measured runs · <span className="font-mono">{measuredAt}</span></span>
      </summary>
      <div className="flex flex-col gap-6 px-6 pt-2 pb-6">
        <Prose paragraphs={[INTRO]} />
        <QuickNotes quick={quick} />
        <p className="font-mono text-label text-muted-foreground">{measuredCaption(baseline)}</p>
        <MeasuredTable {...shared} cpuQuota={setup.apiCpu} />
        <MeasuredList {...shared} />
        {footnote !== null && <Prose paragraphs={[footnote]} />}
      </div>
    </details>
  );
}
