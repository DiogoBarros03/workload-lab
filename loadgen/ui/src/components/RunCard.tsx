import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReset } from "@/hooks/use-reset";
import { validCount } from "@/lib/format";
import type { Op, RunConfig } from "@/lib/run";
import { NumberField } from "./NumberField";
import { Notice } from "./Notice";
import { OpTabs } from "./OpTabs";
import { Presets, type Preset } from "./Presets";
import { RunActions } from "./RunActions";

const MAX_RPS = 5000;
const MAX_DURATION_SEC = 300;

type Props = { running: boolean; warning: string | null; onRun: (c: RunConfig) => void; onStop: () => void; className?: string };

export function RunCard({ running, warning, onRun, onStop, className }: Props) {
  const [op, setOp] = useState<Op>("read");
  const [rps, setRps] = useState("100");
  const [duration, setDuration] = useState("30");
  const reset = useReset();
  const valid = validCount(rps, MAX_RPS) && validCount(duration, MAX_DURATION_SEC);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (valid && !running) onRun({ mode: "open", op, rps: +rps, durationSec: +duration });
  };
  const pick = (p: Preset) => { setRps(String(p.rps)); setDuration(String(p.durationSec)); };
  return (
    <Card className={className}>
      <CardHeader><CardTitle>Run</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-6">
          <OpTabs value={op} onChange={setOp} disabled={running} />
          <NumberField id="rps" label="Requests per second" value={rps} max={MAX_RPS} disabled={running} onChange={setRps} />
          <NumberField
            id="duration" label="Duration" unit="s" scale="linear"
            value={duration} max={MAX_DURATION_SEC} disabled={running} onChange={setDuration}
          />
          <Presets disabled={running} onPick={pick} />
          <RunActions running={running} valid={valid} resetBusy={reset.busy} onStop={onStop} onReset={reset.reset} />
          {warning && <p className="text-sm text-red-fg">{warning}</p>}
          <Notice error={reset.error} note={reset.note} />
        </form>
      </CardContent>
    </Card>
  );
}
