import { useState } from "react";
import { ArrowCounterClockwise, Play, Stop } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReset } from "@/hooks/use-reset";
import { validCount } from "@/lib/format";
import type { Op, RunConfig } from "@/lib/run";
import { NumberField } from "./NumberField";
import { Notice } from "./Notice";
import { OpTabs } from "./OpTabs";
import { Presets } from "./Presets";

const MAX_REQUESTS = 200000;
const MAX_CONCURRENCY = 5000;

type Props = { running: boolean; runError: string | null; onRun: (c: RunConfig) => void; onStop: () => void; className?: string };

export function RunCard({ running, runError, onRun, onStop, className }: Props) {
  const [op, setOp] = useState<Op>("read");
  const [requests, setRequests] = useState("1000");
  const [concurrency, setConcurrency] = useState("10");
  const reset = useReset();
  const valid = validCount(requests, MAX_REQUESTS) && validCount(concurrency, MAX_CONCURRENCY);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (valid && !running) onRun({ op, requests: +requests, concurrency: +concurrency });
  };
  return (
    <Card className={className}>
      <CardHeader><CardTitle>Run</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-6">
          <OpTabs value={op} onChange={setOp} disabled={running} />
          <NumberField id="requests" label="Requests" value={requests} max={MAX_REQUESTS} disabled={running} onChange={setRequests} />
          <NumberField id="concurrency" label="Concurrency" value={concurrency} max={MAX_CONCURRENCY} disabled={running} onChange={setConcurrency} />
          <Presets disabled={running} onPick={(p) => { setRequests(String(p.requests)); setConcurrency(String(p.concurrency)); }} />
          <div className="flex flex-col gap-2 sm:flex-row">
            {running
              ? <Button type="button" className="sm:flex-1" onClick={onStop}><Stop weight="bold" />Stop</Button>
              : <Button type="submit" className="sm:flex-1" disabled={!valid}><Play weight="bold" />Run</Button>}
            <Button type="button" variant="outline" disabled={running || reset.busy} onClick={reset.reset}>
              <ArrowCounterClockwise weight="bold" />Reset data
            </Button>
          </div>
          <Notice error={runError ?? reset.error} note={reset.note} />
        </form>
      </CardContent>
    </Card>
  );
}
