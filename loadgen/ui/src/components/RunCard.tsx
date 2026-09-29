import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReset } from "@/hooks/use-reset";
import { validCount } from "@/lib/format";
import type { Project } from "@/lib/projects";
import { cn } from "@/lib/utils";
import type { RunConfig, RunForm } from "@/lib/run";
import { NumberField } from "./NumberField";
import { Notice } from "./Notice";
import { OpTabs } from "./OpTabs";
import { RunActions } from "./RunActions";

const MAX_RPS = 5000;
const MAX_DURATION_SEC = 300;

type Props = {
  project: Project; form: RunForm; onForm: (f: RunForm) => void; runRef: React.Ref<HTMLButtonElement>;
  running: boolean; warning: string | null; onRun: (c: RunConfig) => void; onStop: () => void; className?: string;
  control?: React.ReactNode; phase: string | null; busy: boolean;
};

export function RunCard({ project, form, onForm, runRef, running, warning, onRun, onStop, className, control, phase, busy }: Props) {
  const { op, rps, duration } = form;
  const set = (patch: Partial<RunForm>) => onForm({ ...form, ...patch });
  const reset = useReset(project);
  const valid = !busy && validCount(rps, MAX_RPS) && validCount(duration, MAX_DURATION_SEC);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (valid && !running && phase === null) onRun({ mode: "open", op, rps: +rps, durationSec: +duration });
  };
  return (
    <Card id="run-card" className={cn("scroll-mt-6", className)}>
      <CardHeader><CardTitle>Run</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-6">
        {control}
        <form onSubmit={submit} className="flex flex-col gap-6">
          <OpTabs value={op} onChange={(v) => set({ op: v })} disabled={running} />
          <NumberField id="rps" label="Requests per second" value={rps} max={MAX_RPS} disabled={running} onChange={(v) => set({ rps: v })} />
          <NumberField
            id="duration" label="Duration" unit="s" scale="linear"
            value={duration} max={MAX_DURATION_SEC} disabled={running} onChange={(v) => set({ duration: v })}
          />
          <RunActions runRef={runRef} running={running} valid={valid} phase={phase} resetBusy={reset.busy} onStop={onStop} onReset={reset.reset} />
          {warning && <p className="text-meta text-red-fg">{warning}</p>}
          <Notice error={reset.error} note={reset.note} />
        </form>
      </CardContent>
    </Card>
  );
}
