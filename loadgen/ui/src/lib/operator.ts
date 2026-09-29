import type { Project } from "./projects";
import { SERVICES, type Health, type Service } from "./status";

const STATES = ["running", "exited", "absent"] as const;
const HEALTHS = ["healthy", "unhealthy", "starting", null] as const;
export type OpService = { state: (typeof STATES)[number]; health: (typeof HEALTHS)[number] };
export type OpStates = Partial<Record<Service, OpService>>;

function serviceOf(name: string, raw: unknown): OpService {
  const { state, health } = raw as OpService;
  if (!STATES.includes(state)) throw new Error(`operator reported ${name} state ${state}`);
  if (!HEALTHS.includes(health)) throw new Error(`operator reported ${name} health ${health}`);
  return { state, health };
}

// Validates the operator's GET /containers body; unknown services are dropped.
export function containerStates(payload: unknown): OpStates {
  const services = (payload as { services?: Record<string, unknown> } | null)?.services;
  if (typeof services !== "object" || services === null) throw new Error("operator payload has no services");
  return Object.fromEntries(SERVICES.filter((s) => s in services).map((s) => [s, serviceOf(s, services[s])]));
}

// loadgen serves this page, so the page never stops it.
export const controllable = (project: Project): Service[] => project.services.filter((s) => s !== "loadgen");

const isRunning = (states: OpStates | null, s: Service) => states?.[s]?.state === "running";
export const allRunning = (states: OpStates | null, services: readonly Service[]) => services.every((s) => isRunning(states, s));
export const anyRunning = (states: OpStates | null, services: readonly Service[]) => services.some((s) => isRunning(states, s));

const isOff = (op: OpService | undefined) => op?.state === "exited" || op?.state === "absent";

// Only the operator can tell stopped from broken; a running service keeps its status.
export const mergeOff = (health: Record<Service, Health>, states: OpStates | null): Record<Service, Health> =>
  Object.fromEntries(SERVICES.map((s) => [s, isOff(states?.[s]) ? "off" : health[s]])) as Record<Service, Health>;

const wordOf = (op: OpService | undefined) => (op === undefined ? "unknown" : isOff(op) ? "off" : "running");
export const summaryOf = (states: OpStates, services: readonly Service[]) =>
  services.map((s) => `${s} ${wordOf(states[s])}`).join(" · ");

const POD_STATES = ["running", "waiting", "terminated"] as const;
type PodContainer = { name: string; state: (typeof POD_STATES)[number]; ready: boolean };
type Overlay = { applied: boolean; pods: { containers: PodContainer[] }[] };
type Cluster = { exists: false } | { exists: true; ready: string; overlays: Record<string, Overlay> };
export type ClusterSummary = { exists: boolean; ready: string | null; applied: string[] };

// Validates the operator's GET /cluster body; overlays are only read once the cluster exists.
function clusterOf(payload: unknown): Cluster {
  const c = payload as { exists?: unknown; ready?: unknown; overlays?: unknown } | null;
  if (typeof c?.exists !== "boolean") throw new Error("operator cluster payload has no exists");
  if (!c.exists) return { exists: false };
  if (typeof c.overlays !== "object" || c.overlays === null) throw new Error("operator cluster payload has no overlays");
  if (typeof c.ready !== "string") throw new Error("operator cluster payload has no ready");
  return c as Cluster;
}

function checked(c: PodContainer): PodContainer {
  if (!POD_STATES.includes(c.state)) throw new Error(`operator reported container ${c.name} state ${c.state}`);
  return c;
}

// Pod container names, by the service they run.
const SERVICE_OF = new Map<string, Service>([["api", "api"], ["stats-sidecar", "sidecar"], ["postgres", "db"], ["db", "db"]]);
// loadgen serves this page, so it is running whenever the page is read.
const LOADGEN: OpService = { state: "running", health: null };

// Waiting is starting, not stopped; only all-terminated reads as exited.
function opOf(containers: PodContainer[]): OpService {
  if (containers.length === 0) return { state: "absent", health: null };
  if (containers.every((c) => c.state === "terminated")) return { state: "exited", health: null };
  return { state: "running", health: containers.every((c) => c.ready) ? "healthy" : "starting" };
}

// Per-service states of one overlay's pods; a missing overlay or cluster reads as absent.
export function clusterStates(payload: unknown, overlay: string): OpStates {
  const cluster = clusterOf(payload);
  const pods = cluster.exists ? (cluster.overlays[overlay]?.pods ?? []) : [];
  const containers = pods.flatMap((p) => p.containers).map(checked);
  const of = (s: Service) => (s === "loadgen" ? LOADGEN : opOf(containers.filter((c) => SERVICE_OF.get(c.name) === s)));
  return Object.fromEntries(SERVICES.map((s) => [s, of(s)]));
}

export function clusterSummary(payload: unknown): ClusterSummary {
  const cluster = clusterOf(payload);
  if (!cluster.exists) return { exists: false, ready: null, applied: [] };
  const applied = Object.entries(cluster.overlays).filter(([, o]) => o.applied).map(([name]) => name);
  return { exists: true, ready: cluster.ready, applied };
}
