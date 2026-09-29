import { fmtInt, fmtMs, type Tone } from "./format";
import type { Op } from "./run";

export type Verdict = "ok" | "degraded" | "failed";
export type Run = {
  op: Op; targetRps: number; achievedRps: number; p50: number; p99: number; dropped: number; errors: number;
  maxInFlight: number; peakCpuCores: number | null; throttledPeriods: number; peakMemMiB: number | null; peakPoolWaiting: number | null;
  peakCommitsPerSec: number | null; cause: string; verdict: Verdict;
  // Kind runs only: who sampled the api, how often it restarted, and the sidecar's own CPU reading.
  observer?: string; restartsAfter?: number; peakCpuCoresSidecar?: number | null;
};
export type Setup = {
  apiCpu: number; apiMemMiB: number; poolMax: number; dbCpu: number; dbMemMiB: number; durationSec: number;
  sidecarCpu?: number; sidecarMemMiB?: number;
};
// target and overlay are absent on compose datasets.
export type Baseline = { measuredAt: string; target?: string; overlay?: string; setup: Setup; runs: Run[]; findings: string[] };

const SETUP_KEYS = ["apiCpu", "apiMemMiB", "poolMax", "dbCpu", "dbMemMiB", "durationSec"] as const;
const RUN_NUMBERS = ["targetRps", "achievedRps", "p50", "p99", "dropped", "errors", "maxInFlight", "throttledPeriods"] as const;
// Sampled while the api was being killed, so a peak can be null but never absent.
const RUN_PEAKS = ["peakCpuCores", "peakMemMiB", "peakPoolWaiting", "peakCommitsPerSec"] as const;
const OPS: readonly unknown[] = ["read", "write", "mixed"];
const VERDICTS: readonly unknown[] = ["ok", "degraded", "failed"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function check(ok: boolean, path: string) {
  if (!ok) throw new Error(`baseline: ${path} is missing or malformed`);
}

function checkNumbers(o: Obj, keys: readonly string[], at: string) {
  for (const k of keys) check(Number.isFinite(o[k]), `${at}${k}`);
}

const isNum = (v: unknown) => Number.isFinite(v);
const isPeak = (v: unknown) => v === null || isNum(v);
// Optional keys may be absent; when present they must pass the check.
const checkOptional = (o: Obj, key: string, ok: (v: unknown) => boolean, at: string) => check(!(key in o) || ok(o[key]), `${at}${key}`);

function checkRun(r: unknown, i: number) {
  const at = `runs[${i}]`;
  check(isObj(r), at);
  const o = r as Obj;
  checkNumbers(o, RUN_NUMBERS, `${at}.`);
  for (const k of RUN_PEAKS) check(isPeak(o[k]), `${at}.${k}`);
  checkOptional(o, "observer", (v) => typeof v === "string", `${at}.`);
  checkOptional(o, "restartsAfter", isNum, `${at}.`);
  checkOptional(o, "peakCpuCoresSidecar", isPeak, `${at}.`);
  check(OPS.includes(o.op), `${at}.op`);
  check(VERDICTS.includes(o.verdict), `${at}.verdict`);
  check(typeof o.cause === "string", `${at}.cause`);
}

const isStr = (v: unknown) => typeof v === "string";

// Shape check for a results/*.json dataset; throws on the first bad field.
export function parseBaseline(v: unknown): Baseline {
  if (!isObj(v)) throw new Error("baseline: not an object");
  check(typeof v.measuredAt === "string", "measuredAt");
  checkOptional(v, "target", isStr, "");
  checkOptional(v, "overlay", isStr, "");
  check(isObj(v.setup), "setup");
  const setup = v.setup as Obj;
  checkNumbers(setup, SETUP_KEYS, "setup.");
  for (const k of ["sidecarCpu", "sidecarMemMiB"]) checkOptional(setup, k, isNum, "setup.");
  check(Array.isArray(v.runs), "runs");
  (v.runs as unknown[]).forEach(checkRun);
  check(Array.isArray(v.findings) && v.findings.every((f) => typeof f === "string"), "findings");
  return v as Baseline;
}

const TONES: Record<Verdict, Tone> = { ok: "green", degraded: "yellow", failed: "red" };
export const verdictTone = (v: Verdict): Tone => TONES[v];

export const OP_TITLE: Record<Op, string> = { read: "Read", write: "Write", mixed: "Mixed" };
export const OP_NOTE: Record<Op, string> = { read: "GET /books/:id", write: "POST /books", mixed: "half reads, half writes" };
export const VERDICT_LABEL: Record<Verdict, string> = { ok: "OK", degraded: "Degraded", failed: "Failed" };

// A 2px left rule flags runs that did not hold up.
export const VERDICT_RULE: Record<Verdict, string> = { ok: "", degraded: "border-l-2 border-l-yellow-fg", failed: "border-l-2 border-l-red-fg" };

export const runName = (r: Run) => `${OP_TITLE[r.op]} at ${fmtInt(r.targetRps)} RPS`;

export const oomKilled = (r: Run) => r.cause.includes("OOM-killed");

const OP_ORDER: readonly Op[] = ["read", "write", "mixed"];

// One group per operation that has runs, each sorted by target rate.
export function groupRuns(runs: readonly Run[]): { op: Op; runs: Run[] }[] {
  return OP_ORDER
    .map((op) => ({ op, runs: runs.filter((r) => r.op === op).toSorted((a, b) => a.targetRps - b.targetRps) }))
    .filter((g) => g.runs.length > 0);
}

export const failedCount = (r: Run) => r.dropped + r.errors;

// Percent below target, or null when the run reached 95 % of it.
export function shortfallPct(r: Run): number | null {
  const ratio = r.achievedRps / r.targetRps;
  return ratio >= 0.95 ? null : Math.round((1 - ratio) * 100);
}

// A null peak was not sampled; it reads as a dash.
const cores = (v: number | null) => (v === null ? "—" : v.toFixed(2));
const count = (v: number | null) => (v === null ? "—" : fmtInt(v));

// The muted second line of a Measured row; the CPU quota is shown when known.
export function detailLine(r: Run, cpuQuota?: number): string {
  const quota = cpuQuota === undefined ? "" : ` / ${cpuQuota.toFixed(2)}`;
  const parts = [
    `Peak CPU ${cores(r.peakCpuCores)}${quota} cores`, `Throttled ${fmtInt(r.throttledPeriods)}`,
    `Pool waiting ${count(r.peakPoolWaiting)}`, `Max in flight ${fmtInt(r.maxInFlight)}`, `p50 ${fmtMs(r.p50)} ms`,
  ];
  const sidecar = r.peakCpuCoresSidecar === undefined ? [] : [`Sidecar CPU ${cores(r.peakCpuCoresSidecar)}`];
  const restarts = r.restartsAfter !== undefined && r.restartsAfter > 0 ? [`Restarts ${fmtInt(r.restartsAfter)}`] : [];
  const failed = failedCount(r) > 0 ? [`Dropped ${fmtInt(r.dropped)}`, `Errors ${fmtInt(r.errors)}`] : [];
  return [...parts, ...sidecar, ...restarts, ...failed].join(" · ");
}

// The setup line under the Measured intro; kind datasets say so first.
export function measuredCaption({ target, setup: s }: Baseline): string {
  const where = target?.startsWith("k8s") ? ["Measured on kind"] : [];
  const sidecar = s.sidecarCpu === undefined ? [] : [`sidecar ${s.sidecarCpu} CPU / ${s.sidecarMemMiB} MiB`];
  return [...where, `${s.durationSec} s per run`, `API ${s.apiCpu} CPU / ${s.apiMemMiB} MiB / pool ${s.poolMax}`, ...sidecar].join(" · ");
}

// The measured verdict for a preset, or null when that op and rate were never measured.
export const verdictFor = (q: { op: Op; rps: number }, b: Baseline): Verdict | null =>
  b.runs.find((r) => r.op === q.op && r.targetRps === q.rps)?.verdict ?? null;

export const runPresetFrom = (r: Run, durationSec: number) => ({ op: r.op, rps: r.targetRps, durationSec });

// Digit runs not glued to a word (so "p99" stays text), with thousands groups and decimals.
const DIGITS = /(?<![A-Za-z\d.])\d+(?:[ \u2009]\d{3}(?!\d))*(?:\.\d+)?/g;

export function monoDigits(text: string): { text: string; mono: boolean }[] {
  const parts: { text: string; mono: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(DIGITS)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), mono: false });
    parts.push({ text: m[0], mono: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), mono: false });
  return parts;
}
