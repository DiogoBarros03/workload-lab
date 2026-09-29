import { CircleNotch, Power } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { ClusterJob, Operator } from "@/hooks/use-operator";
import { useSecondClick } from "@/hooks/use-second-click";
import { allRunning, controllable, summaryOf, type ClusterSummary } from "@/lib/operator";
import type { Project } from "@/lib/projects";
import { othersActive, type Active } from "@/lib/runtime";

type Props = { operator: Operator; project: Project; running: boolean; onSwitch: (other: Active) => void };

const LABEL = {
  start: "Starting…", stop: "Stopping…", up: "Creating Cluster…", apply: "Starting…", delete: "Stopping…", down: "Deleting Cluster…", wait: "Waiting…",
} as const;

function Toggle({ on, operator, running, onClick, idle }: { on: boolean; operator: Operator; running: boolean; onClick: () => void; idle: string }) {
  const busy = operator.busy;
  return (
    <Button type="button" variant={on ? "outline" : "default"} disabled={busy !== null || running} onClick={onClick}>
      {busy ? <CircleNotch weight="bold" className="animate-spin" /> : <Power weight="bold" />}
      {busy ? LABEL[busy] : idle}
    </Button>
  );
}

function ComposeToggle({ operator, project, running }: Props) {
  const services = controllable(project);
  const on = allRunning(operator.services, services);
  const onClick = () => void (on ? operator.stop(services) : operator.start(services));
  return <Toggle on={on} operator={operator} running={running} onClick={onClick} idle={on ? "Stop Containers" : "Start Containers"} />;
}

// Absent cluster: create it; then apply or delete this project's overlay.
function clusterStep(c: ClusterSummary, overlay: string): { job: ClusterJob; idle: string; on: boolean } {
  if (!c.exists) return { job: "up", idle: "Create Cluster", on: false };
  return c.applied.includes(overlay) ? { job: "delete", idle: "Stop Containers", on: true } : { job: "apply", idle: "Start Containers", on: false };
}

function ClusterToggle({ operator, overlay, running }: Props & { overlay: string }) {
  if (operator.cluster === null) return null;
  const { job, idle, on } = clusterStep(operator.cluster, overlay);
  return <Toggle on={on} operator={operator} running={running} onClick={() => void operator.runJob(job)} idle={idle} />;
}

// Deleting the cluster asks for a second click, and only when nothing is applied.
function DeleteCluster({ operator }: { operator: Operator }) {
  const { warned, click } = useSecondClick(true, () => void operator.runJob("down"));
  return (
    <button type="button" onClick={click} disabled={operator.busy !== null}
      className="inline-flex min-h-11 items-center font-sans text-label text-muted-foreground underline underline-offset-2 hover:text-ink disabled:opacity-50">
      {warned ? "Confirm Delete Cluster" : "Delete Cluster"}
    </button>
  );
}

function ClusterLine({ operator, project }: { operator: Operator; project: Project }) {
  const c = operator.cluster;
  if (c === null || operator.services === null) return null;
  const text = c.exists ? `cluster ${c.ready} nodes · ${summaryOf(operator.services, controllable(project))}` : "cluster off";
  // Wraps only between segments, never inside "db off".
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <p className="flex flex-wrap gap-x-[1ch] font-mono text-label text-muted-foreground">
        {text.split(" · ").map((part, i) => <span key={part} className="whitespace-pre">{i > 0 ? `· ${part}` : part}</span>)}
      </p>
      {c.exists && c.applied.length === 0 && <DeleteCluster operator={operator} />}
    </div>
  );
}

const ComposeLine = ({ operator, project }: { operator: Operator; project: Project }) =>
  operator.services && <p className="font-mono text-label text-muted-foreground">{summaryOf(operator.services, controllable(project))}</p>;

// Another project's runtime is up: offer to stop it through the switch dialog.
function OtherRunning({ operator, project, onSwitch }: Props) {
  const other = othersActive(operator.active, project)[0];
  if (other === undefined) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-label text-muted-foreground">
      {other.label} is running.
      <button type="button" disabled={operator.busy !== null} onClick={() => onSwitch(other)}
        className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-ink disabled:opacity-50 sm:min-h-0">Stop It</button>
    </p>
  );
}

const OperatorMissing = () => (
  <p className="text-label text-muted-foreground">Operator not running. Start it on the host with <code className="font-mono text-ink-soft">npm run lab</code>.</p>
);

// Starts and stops the project's containers through the host operator: compose, or the kind cluster.
export function ContainersControl(props: Props) {
  const { operator, project } = props;
  const { runtime } = project;
  return (
    <div className="flex flex-col gap-2 border-b pb-6">
      <div className="flex min-h-11 items-center justify-between gap-3 sm:min-h-9">
        <span className="text-label font-medium text-ink">Containers</span>
        {operator.reachable && (runtime.kind === "kind" ? <ClusterToggle {...props} overlay={runtime.overlay} /> : <ComposeToggle {...props} />)}
      </div>
      {!operator.reachable ? <OperatorMissing /> : runtime.kind === "kind" ? <ClusterLine {...props} /> : <ComposeLine {...props} />}
      {operator.reachable && <OtherRunning {...props} />}
      {operator.busy === "up" && <p className="text-label text-muted-foreground">Three nodes, about a minute the first time.</p>}
      {operator.error && <p role="alert" className="text-label text-red-fg">{operator.error}</p>}
    </div>
  );
}
