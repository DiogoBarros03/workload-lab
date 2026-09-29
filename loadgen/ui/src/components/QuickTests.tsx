import { CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useSecondClick } from "@/hooks/use-second-click";
import { monoDigits, verdictFor, type Baseline, type Verdict } from "@/lib/baseline";
import type { QuickTest } from "@/lib/learning";
import type { RunConfig } from "@/lib/run";
import { cn } from "@/lib/utils";
import { RiskNote } from "./RunThisButton";

type Props = { quick: QuickTest[]; baseline: Baseline; disabled: boolean; phase: string | null; pending: RunConfig | null; onRun: (q: QuickTest) => void };

const DOT: Record<Verdict, string> = { ok: "bg-green-fg", degraded: "bg-yellow-fg", failed: "bg-red-fg" };

// Sans label with the rate in mono at full size, never below 13px.
export const QuickLabel = ({ label }: { label: string }) =>
  monoDigits(label).map((p, i) => (p.mono ? <span key={i} className="font-mono">{p.text}</span> : p.text));

const same = (q: QuickTest, c: RunConfig | null) => c !== null && c.op === q.op && c.rps === q.rps && c.durationSec === q.durationSec;

type ButtonProps = { test: QuickTest; verdict: Verdict | null; disabled: boolean; phase: string | null; onRun: () => void };

// While its runtime starts, the clicked button shows the phase in place of the rate.
function QuickButton({ test, verdict, disabled, phase, onRun }: ButtonProps) {
  const { warned, click } = useSecondClick(verdict === "failed", onRun);
  const measured = verdict === null ? "not measured" : `measured ${verdict}`;
  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" disabled={disabled || phase !== null} aria-label={phase ?? `${test.label}, ${measured}`} onClick={click}
        className="h-11 min-w-[9rem] justify-start bg-secondary text-ink sm:h-11">
        {phase === null
          ? <span aria-hidden className={cn("size-2 shrink-0 rounded-full", verdict === null ? "bg-muted-foreground" : DOT[verdict])} />
          : <CircleNotch weight="bold" className="animate-spin" />}
        <span>{phase ?? <QuickLabel label={test.label} />}</span>
      </Button>
      {warned && <RiskNote />}
    </div>
  );
}

// One-click preset runs; the dot is the verdict this rate got when measured.
export function QuickTests({ quick, baseline, disabled, phase, pending, onRun }: Props) {
  return (
    <div className="flex flex-col gap-2 border-b pb-6">
      <span className="text-label font-medium text-ink">Quick Tests</span>
      <div className="flex flex-wrap items-start gap-2">
        {quick.map((q) => <QuickButton key={q.label} test={q} verdict={verdictFor(q, baseline)} disabled={disabled || pending !== null}
          phase={same(q, pending) ? phase : null} onRun={() => onRun(q)} />)}
      </div>
    </div>
  );
}
