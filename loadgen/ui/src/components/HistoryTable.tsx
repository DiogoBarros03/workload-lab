import { Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtInt, fmtMs } from "@/lib/format";
import type { HistoryEntry } from "@/lib/history";
import { cn } from "@/lib/utils";

const COLS = ["Time", "Operation", "Target RPS", "Duration", "Achieved RPS", "p50 (ms)", "p99 (ms)", "Dropped", "Errors"];
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Row({ e }: { e: HistoryEntry }) {
  const cells = [
    time(e.at), e.op, fmtInt(e.targetRps), `${e.durationSec} s`, fmtInt(e.rps),
    fmtMs(e.p50), fmtMs(e.p99), fmtInt(e.dropped), fmtInt(e.errors),
  ];
  return (
    <TableRow>
      {cells.map((c, i) => <TableCell key={COLS[i]} className={i < 2 ? "" : "text-right font-mono"}>{c}</TableCell>)}
    </TableRow>
  );
}

export function HistoryTable({ entries, onClear }: { entries: HistoryEntry[]; onClear: () => void }) {
  return (
    <section aria-labelledby="history-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex items-end justify-between">
        <h3 id="history-title" className="font-serif text-2xl font-normal text-ink">History</h3>
        <Button variant="ghost" disabled={entries.length === 0} onClick={onClear}><Trash weight="bold" />Clear</Button>
      </div>
      {entries.length === 0
        ? <p className="text-muted-foreground">Finished runs appear here, newest first, and stay after a reload.</p>
        : (
          <Table>
            <TableHeader>
              <TableRow>{COLS.map((c, i) => <TableHead key={c} className={cn("text-sm", i >= 2 && "text-right")}>{c}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>{entries.map((e) => <Row key={e.at} e={e} />)}</TableBody>
          </Table>
        )}
    </section>
  );
}
