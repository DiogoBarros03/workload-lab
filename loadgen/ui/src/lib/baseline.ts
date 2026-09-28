import { fmtInt, fmtMs, type Tone } from "./format";
import type { Op } from "./run";

export type Verdict = "ok" | "degraded" | "failed";
export type Run = {
  op: Op; targetRps: number; achievedRps: number; p50: number; p99: number; dropped: number; errors: number;
  maxInFlight: number; peakCpuCores: number; throttledPeriods: number; peakMemMiB: number; peakPoolWaiting: number;
  peakCommitsPerSec: number; cause: string; verdict: Verdict;
};
export type Setup = { apiCpu: number; apiMemMiB: number; poolMax: number; dbCpu: number; dbMemMiB: number; durationSec: number };
export type Baseline = { measuredAt: string; setup: Setup; runs: Run[]; findings: string[] };

const SETUP_KEYS = ["apiCpu", "apiMemMiB", "poolMax", "dbCpu", "dbMemMiB", "durationSec"] as const;
const RUN_NUMBERS = [
  "targetRps", "achievedRps", "p50", "p99", "dropped", "errors", "maxInFlight", "peakCpuCores",
  "throttledPeriods", "peakMemMiB", "peakPoolWaiting", "peakCommitsPerSec",
] as const;
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

function checkRun(r: unknown, i: number) {
  const at = `runs[${i}]`;
  check(isObj(r), at);
  const o = r as Obj;
  checkNumbers(o, RUN_NUMBERS, `${at}.`);
  check(OPS.includes(o.op), `${at}.op`);
  check(VERDICTS.includes(o.verdict), `${at}.verdict`);
  check(typeof o.cause === "string", `${at}.cause`);
}

// Shape check for results/000-baseline.json; throws on the first bad field.
export function parseBaseline(v: unknown): Baseline {
  if (!isObj(v)) throw new Error("baseline: not an object");
  check(typeof v.measuredAt === "string", "measuredAt");
  check(isObj(v.setup), "setup");
  checkNumbers(v.setup as Obj, SETUP_KEYS, "setup.");
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

// The muted second line of a Measured row; the CPU quota is shown when known.
export function detailLine(r: Run, cpuQuota?: number): string {
  const quota = cpuQuota === undefined ? "" : ` / ${cpuQuota.toFixed(2)}`;
  const parts = [
    `Peak CPU ${r.peakCpuCores.toFixed(2)}${quota} cores`, `Throttled ${fmtInt(r.throttledPeriods)}`,
    `Pool waiting ${fmtInt(r.peakPoolWaiting)}`, `Max in flight ${fmtInt(r.maxInFlight)}`, `p50 ${fmtMs(r.p50)} ms`,
  ];
  const failed = failedCount(r) > 0 ? [`Dropped ${fmtInt(r.dropped)}`, `Errors ${fmtInt(r.errors)}`] : [];
  return [...parts, ...failed].join(" · ");
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
