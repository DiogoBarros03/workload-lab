import { CircleNotch, Power } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { Operator } from "@/hooks/use-operator";
import { allRunning, summaryOf } from "@/lib/operator";
import type { Service } from "@/lib/status";

type Props = { operator: Operator; services: readonly Service[]; running: boolean };

const LABEL = { start: "Starting…", stop: "Stopping…" } as const;

function Toggle({ operator, services, running }: Props) {
  const on = allRunning(operator.services, services);
  const busy = operator.busy;
  return (
    <Button
      type="button" variant={on ? "outline" : "default"} disabled={busy !== null || running}
      onClick={() => void (on ? operator.stop(services) : operator.start(services))}
    >
      {busy ? <CircleNotch weight="bold" className="animate-spin" /> : <Power weight="bold" />}
      {busy ? LABEL[busy] : on ? "Stop Containers" : "Start Containers"}
    </Button>
  );
}

// Starts and stops the project's containers through the host operator.
export function ContainersControl(props: Props) {
  const { operator, services } = props;
  return (
    <div className="flex flex-col gap-2 border-b pb-6">
      <div className="flex min-h-11 items-center justify-between gap-3 sm:min-h-9">
        <span className="text-label font-medium text-ink">Containers</span>
        {operator.reachable && <Toggle {...props} />}
      </div>
      {operator.reachable && operator.services
        ? <p className="font-mono text-label text-muted-foreground">{summaryOf(operator.services, services)}</p>
        : <p className="text-label text-muted-foreground">Operator not running. Start it on the host with <code className="font-mono text-ink-soft">npm run lab</code>.</p>}
      {operator.error && <p role="alert" className="text-label text-red-fg">{operator.error}</p>}
    </div>
  );
}
