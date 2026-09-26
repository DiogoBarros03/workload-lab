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
