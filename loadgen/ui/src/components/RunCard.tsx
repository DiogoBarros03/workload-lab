import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReset } from "@/hooks/use-reset";
import { validCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RunConfig, RunForm } from "@/lib/run";
import { NumberField } from "./NumberField";
import { Notice } from "./Notice";
import { OpTabs } from "./OpTabs";
import { Presets, type Preset } from "./Presets";
import { RunActions } from "./RunActions";

const MAX_RPS = 5000;
const MAX_DURATION_SEC = 300;

type Props = {
  form: RunForm; onForm: (f: RunForm) => void; runRef: React.Ref<HTMLButtonElement>;
  running: boolean; warning: string | null; onRun: (c: RunConfig) => void; onStop: () => void; className?: string;
  control?: React.ReactNode; blocked?: boolean;
};

// Stopped containers are expected, so their hint is muted, not red.
function Warning({ blocked, warning }: { blocked: boolean; warning: string | null }) {
  if (blocked) return <p className="text-label text-muted-foreground">Start the containers to run.</p>;
  return warning && <p className="text-meta text-red-fg">{warning}</p>;
}

export function RunCard({ form, onForm, runRef, running, warning, onRun, onStop, className, control, blocked = false }: Props) {
  const { op, rps, duration } = form;
  const set = (patch: Partial<RunForm>) => onForm({ ...form, ...patch });
  const reset = useReset();
  const valid = !blocked && validCount(rps, MAX_RPS) && validCount(duration, MAX_DURATION_SEC);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (valid && !running) onRun({ mode: "open", op, rps: +rps, durationSec: +duration });
  };
  const pick = (p: Preset) => set({ rps: String(p.rps), duration: String(p.durationSec) });
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
          <Presets disabled={running} onPick={pick} />
          <RunActions runRef={runRef} running={running} valid={valid} resetBusy={reset.busy} onStop={onStop} onReset={reset.reset} />
          <Warning blocked={blocked} warning={warning} />
          <Notice error={reset.error} note={reset.note} />
        </form>
      </CardContent>
    </Card>
  );
}
