import type { Project } from "./projects";

export type Service = "api" | "db" | "loadgen";
export type State = "up" | "slow" | "down";
export type Health = State | "unknown";

const DB_KEYS = [
  "connUsed", "connMax", "activeBackends", "waitingBackends", "poolBusy",
  "poolMax", "poolWaiting", "commitsPerSec", "rowsPerSec", "cacheHitRatio",
] as const;
export type DbLoad = Record<(typeof DB_KEYS)[number], number | null>;

// state and reason are newer server fields; only the db row has DbLoad.
export type Container = {
  service: Service;
  up: boolean;
  state?: State;
  reason?: string | null;
  cpuCores: number | null;
  cpuQuotaCores: number | null;
  nrThrottled: number | null;
  memBytes: number | null;
  memMaxBytes: number | null;
} & Partial<DbLoad>;

export type CpuSample = { at: number; cores: number; quota: number | null; nrThrottled: number | null };
export type DbSample = { at: number; poolWaiting: number | null; commitsPerSec: number | null };

// notes are the server's reasons; reason is set when /status itself failed.
export type StatusView = { health: Record<Service, Health>; notes: Record<Service, string | null>; reason: string | null };

export const SERVICES: readonly Service[] = ["api", "db", "loadgen"];

// Legacy payloads carry only up, so state falls back to it.
export const stateOf = (c: Container): State => c.state ?? (c.up ? "up" : "down");

// A service absent from the payload was not reported, so it is unknown.
function healthOf(containers: Container[] | null, service: Service): Health {
  const c = containers?.find((x) => x.service === service);
  return c ? stateOf(c) : "unknown";
}

const noteOf = (containers: Container[] | null, service: Service) =>
  containers?.find((x) => x.service === service)?.reason ?? null;

const perService = <T,>(f: (s: Service) => T) => ({ api: f("api"), db: f("db"), loadgen: f("loadgen") });

export function deriveStatus(containers: Container[] | null, error: string | null): StatusView {
  const known = error === null ? containers : null;
  return { health: perService((s) => healthOf(known, s)), notes: perService((s) => noteOf(known, s)), reason: error };
}

// Missing db fields read as unknown, never as zero.
export const dbLoad = (c: Container): DbLoad =>
  Object.fromEntries(DB_KEYS.map((k) => [k, c[k] ?? null])) as DbLoad;

export type LoadTone = "fill" | "warn" | "hot" | "muted";

// Utilisation colour: charcoal, then yellow from 60 %, red from 85 %.
export function loadTone(ratio: number | null): LoadTone {
  if (ratio === null) return "muted";
  if (ratio >= 0.85) return "hot";
  return ratio >= 0.6 ? "warn" : "fill";
}

export const isOutage = (v: StatusView) => v.reason !== null || SERVICES.some((s) => v.health[s] === "down");

// The db is only seen through the api's health check.
function dbMessage(v: StatusView) {
  return v.health.api === "down"
    ? "db cannot be checked while the api is down."
    : "db is unreachable: the api's health check answers 503.";
}

export function outageMessages(v: StatusView): string[] {
  return [
    v.health.api === "down" ? (v.notes.api ?? "api is unreachable.") : null,
    v.health.db === "down" ? (v.notes.db ?? dbMessage(v)) : null,
    v.reason !== null ? "loadgen is unreachable: status polling failed." : null,
  ].filter((m) => m !== null);
}

export function runWarning(v: StatusView): string | null {
  const down = (["api", "db"] as const).find((s) => v.health[s] === "down");
  return down ? `${down} is down: requests will fail.` : null;
}

// First time the current outage was seen; null while healthy.
export const nextSince = (since: number | null, outage: boolean, now: number) => (outage ? (since ?? now) : null);

export type Pill = { service: Service; state: Health; label: string; ariaLabel: string };

const WORD: Record<Health, string> = { up: "UP", slow: "SLOW", down: "ERROR", unknown: "?" };
const aria = (s: Service, h: Health) => (h === "unknown" ? `${s} status is unknown` : `${s} is ${h}`);

// Only a ready project's containers run; a service absent from the map is unknown.
export const pillsFor = (project: Project, health: Partial<Record<Service, Health>>): Pill[] =>
  project.status !== "ready" ? [] : project.services.map((service) => {
    const state = health[service] ?? "unknown";
    return { service, state, label: `${service} ${WORD[state]}`, ariaLabel: aria(service, state) };
  });
