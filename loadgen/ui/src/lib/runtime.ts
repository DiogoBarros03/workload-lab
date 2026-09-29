import { anyRunning, controllable, type ClusterSummary, type OpStates } from "./operator";
import type { Project, Runtime } from "./projects";

export type Active = { projectId: string; runtime: Runtime; label: string };
export type Step = { job: "stop"; other: Active } | { job: "start" | "up" | "apply" | "wait" };
export type Plan = { confirm: Active } | { steps: Step[] };

export const labelOf = (p: Project) => `${p.id} ${p.title}`;

const isActive = (p: Project, containers: OpStates | null, cluster: ClusterSummary | null) =>
  p.runtime.kind === "compose" ? anyRunning(containers, controllable(p)) : cluster !== null && cluster.applied.includes(p.runtime.overlay);

// Every ready project whose containers are up: compose api or db running, or its overlay applied.
export const activeRuntimes = (containers: OpStates | null, cluster: ClusterSummary | null, projects: readonly Project[]): Active[] =>
  projects.filter((p) => p.status === "ready" && isActive(p, containers, cluster))
    .map((p) => ({ projectId: p.id, runtime: p.runtime, label: labelOf(p) }));

export const othersActive = (active: readonly Active[], project: Project) => active.filter((a) => a.projectId !== project.id);

function startSteps(project: Project, active: readonly Active[], cluster: ClusterSummary | null): Step[] {
  const { runtime } = project;
  if (runtime.kind === "compose") return [{ job: "start" }];
  if (cluster === null) throw new Error("the cluster state is unknown; is the operator running?");
  if (active.some((a) => a.projectId === project.id)) return [];
  return cluster.exists ? [{ job: "apply" }] : [{ job: "up" }, { job: "apply" }];
}

// Another project's runtime needs a confirm; once given, it is stopped first.
export function planEnsure(project: Project, active: readonly Active[], cluster: ClusterSummary | null, confirmed: boolean): Plan {
  const others = othersActive(active, project);
  if (others.length > 0 && !confirmed) return { confirm: others[0] };
  const stops = others.map((other): Step => ({ job: "stop", other }));
  return { steps: [...stops, ...startSteps(project, active, cluster), { job: "wait" }] };
}

const PHASE = { up: "Creating Cluster…", apply: "Starting Containers…", start: "Starting Containers…", wait: "Waiting for Health…" } as const;
export const phaseOf = (step: Step) => (step.job === "stop" ? `Stopping ${step.other.projectId}…` : PHASE[step.job]);

export function switchText(other: Active, project: Project) {
  const kind = other.runtime.kind === "kind" || project.runtime.kind === "kind";
  const body = `Its containers are running. Stop them and start ${labelOf(project)}'s?${kind ? " The cluster stays up." : ""}`;
  return { title: `Stop ${other.label}?`, body };
}
