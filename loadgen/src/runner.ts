import { randomInt } from "node:crypto";
import { summarize, windowOf, type Sample, type Stats, type Window } from "./stats.ts";

export type Op = "read" | "write" | "mixed";
export type Seed = { sinkIds: readonly number[]; bookIds: readonly number[] };
export type OpenFields = { dropped: number; targetRps: number };
export type Progress = { done: number; inFlight: number; elapsedMs: number; window: Window } & Partial<OpenFields>;
export type Load =
  | { mode?: "closed"; requests: number; concurrency: number }
  | { mode: "open"; rps: number; durationSec: number; maxInFlight?: number };
export type RunOptions = Load & {
  baseUrl: string;
  seed: Seed;
  op: Op;
  signal: AbortSignal;
  onProgress?: (p: Progress) => void;
  progressMs?: number;
};
export type RateOptions = { rps: number; durationSec: number; maxInFlight: number };
export type RateCounts = { started: number; dropped: number; inFlight: number; maxInFlightSeen: number };

const SEED_AUTHORS = 20;
const BOOKS_PER_SEED = 10;
const SINK_AUTHORS = 20;
const LIST_LIMIT = 1000;
const TIMEOUT_MS = 10_000;
const RATE_TICK_MS = 10;
const DEFAULT_MAX_IN_FLIGHT = 10_000;

// Random, not sequential: no state to share across runs or processes.
const nextIsbn = () => String(randomInt(1e13)).padStart(13, "0");

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

const bookBody = (authorId: number) => ({
  author_id: authorId,
  title: "loadgen book",
  isbn: nextIsbn(),
  price_cents: 999,
  stock: 1,
});

// Seeding and reset are setup, not load: any unexpected status must fail loudly.
async function call<T>(baseUrl: string, method: string, path: string, body?: object): Promise<T | null> {
  const res = await fetch(baseUrl + path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : ((await res.json()) as T);
}

type Author = { id: number; name: string };
type Book = { id: number };

async function create<T>(baseUrl: string, path: string, body: object): Promise<T> {
  const row = await call<T>(baseUrl, "POST", path, body);
  if (!row) throw new Error(`POST ${path} returned 404`);
  return row;
}

async function authorsNamed(baseUrl: string, name: string): Promise<Author[]> {
  const rows = await call<Author[]>(baseUrl, "GET", `/authors?name=${name}&limit=${LIST_LIMIT}`);
  if (!rows) throw new Error("GET /authors returned 404");
  return rows;
}

async function ensureAuthors(baseUrl: string, name: string, count: number): Promise<number[]> {
  const existing = (await authorsNamed(baseUrl, name)).map((a) => a.id);
  const created = await Promise.all(
    Array.from({ length: Math.max(0, count - existing.length) }, () =>
      create<Author>(baseUrl, "/authors", { name }),
    ),
  );
  return [...existing, ...created.map((a) => a.id)].slice(0, count);
}

async function seedBooksOf(baseUrl: string, authorId: number): Promise<number[]> {
  // null means the author vanished mid-seed (a concurrent reset): it has no books.
  const listed = (await call<Book[]>(baseUrl, "GET", `/authors/${authorId}/books`)) ?? [];
  const have = listed.slice(0, BOOKS_PER_SEED).map((b) => b.id);
  const made = await Promise.all(
    Array.from({ length: BOOKS_PER_SEED - have.length }, () =>
      create<Book>(baseUrl, "/books", bookBody(authorId)),
    ),
  );
  return [...have, ...made.map((b) => b.id)];
}

export async function ensureSeed(baseUrl: string): Promise<Seed> {
  const [seedIds, sinkIds] = await Promise.all([
    ensureAuthors(baseUrl, "seed", SEED_AUTHORS),
    ensureAuthors(baseUrl, "sink", SINK_AUTHORS),
  ]);
  const books = await Promise.all(seedIds.map((id) => seedBooksOf(baseUrl, id)));
  return { sinkIds, bookIds: books.flat() };
}

// One page per pass; repeat until a pass finds nothing left.
async function deleteNamed(baseUrl: string, name: string): Promise<number> {
  const doomed = await authorsNamed(baseUrl, name);
  if (doomed.length === 0) return 0;
  await Promise.all(doomed.map((a) => call(baseUrl, "DELETE", `/authors/${a.id}`)));
  return doomed.length + (await deleteNamed(baseUrl, name));
}

export async function reset(baseUrl: string): Promise<number> {
  return (await deleteNamed(baseUrl, "seed")) + (await deleteNamed(baseUrl, "sink"));
}

function requestFor(baseUrl: string, op: Op, seed: Seed): [string, RequestInit] {
  const write = op === "write" || (op === "mixed" && Math.random() < 0.5);
  if (!write) return [`${baseUrl}/books/${pick(seed.bookIds)}`, {}];
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bookBody(pick(seed.sinkIds))),
  };
  return [`${baseUrl}/books`, init];
}

// A rejected fetch is a null-status sample; a cancelled fetch is no sample.
async function timed(url: string, init: RequestInit, signal: AbortSignal): Promise<Sample | null> {
  const start = performance.now();
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]);
  const res = await fetch(url, { ...init, signal: timeout }).catch(() => null);
  if (!res) return signal.aborted ? null : { status: null, ms: performance.now() - start };
  // The status already arrived; a broken body does not undo it.
  await res.arrayBuffer().catch(() => undefined);
  return { status: res.status, ms: performance.now() - start };
}

export async function runPool<T>(
  total: number,
  concurrency: number,
  task: (i: number) => Promise<T>,
  signal: AbortSignal,
): Promise<T[]> {
  let next = 0;
  // Closed model; each worker owns its list since copying per sample is O(n^2).
  const worker = async (): Promise<T[]> => {
    const own: T[] = [];
    while (next < total && !signal.aborted) own.push(await task(next++));
    return own;
  };
  return (await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker))).flat();
}

// Each tick hands off its batch and starts a new one, so windows never overlap.
function ticker(start: number) {
  let batch: Sample[] = [];
  let since = start;
  const onSample = (s: Sample) => batch.push(s);
  const take = (now: number) => {
    const w = windowOf(batch, now - since);
    batch = [];
    since = now;
    return w;
  };
  return { onSample, take };
}

// Open model: starts follow the clock, never a completion; over the cap they drop.
export function runRate<T>(opts: RateOptions, task: (i: number) => Promise<T>, signal: AbortSignal) {
  const counts: RateCounts = { started: 0, dropped: 0, inFlight: 0, maxInFlightSeen: 0 };
  const pending: Promise<T>[] = [];
  const endMs = opts.durationSec * 1000;
  const start = performance.now();
  const launch = (fail: (err: unknown) => void) => {
    if (counts.inFlight >= opts.maxInFlight) {
      counts.dropped++;
      return;
    }
    counts.inFlight++;
    counts.maxInFlightSeen = Math.max(counts.maxInFlightSeen, counts.inFlight);
    const p = task(counts.started++).finally(() => counts.inFlight--);
    p.catch(fail);
    pending.push(p);
  };
  const done = new Promise<T[]>((resolve, reject) => {
    const stop = () => {
      clearInterval(timer);
      signal.removeEventListener("abort", finish);
    };
    const finish = () => {
      stop();
      Promise.all(pending).then(resolve, reject);
    };
    const fail = (err: unknown) => {
      stop();
      reject(err);
    };
    // Due count from elapsed time, so rates above 1/tick and timer drift both hold.
    const tick = () => {
      const elapsed = Math.min(performance.now() - start, endMs);
      const due = Math.floor((elapsed * opts.rps) / 1000) - counts.started - counts.dropped;
      for (let k = 0; k < due && !signal.aborted; k++) launch(fail);
      if (elapsed >= endMs || signal.aborted) finish();
    };
    const timer = setInterval(tick, RATE_TICK_MS);
    signal.addEventListener("abort", finish, { once: true });
  });
  return { counts, done };
}

// Picks the model; `live` feeds progress, `final` extends the result.
function startLoad<T>(opts: RunOptions, task: () => Promise<T>) {
  if (opts.mode !== "open") {
    const none = () => ({});
    return { done: runPool(opts.requests, opts.concurrency, task, opts.signal), live: none, final: none };
  }
  // Documented default: the cap is optional in the request body.
  const maxInFlight = opts.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT;
  const { counts, done } = runRate({ rps: opts.rps, durationSec: opts.durationSec, maxInFlight }, task, opts.signal);
  const live = (): OpenFields => ({ dropped: counts.dropped, targetRps: opts.rps });
  return { done, live, final: () => ({ ...live(), maxInFlightSeen: counts.maxInFlightSeen }) };
}

export async function run(opts: RunOptions): Promise<Stats & Partial<OpenFields>> {
  const { baseUrl, seed, op, signal } = opts;
  const counters = { started: 0, done: 0 };
  const start = performance.now();
  const tick = ticker(start);
  const task = async () => {
    counters.started++;
    const sample = await timed(...requestFor(baseUrl, op, seed), signal);
    counters.done++;
    if (sample) tick.onSample(sample);
    return sample;
  };
  const load = startLoad(opts, task);
  const report = () => {
    const now = performance.now();
    const window = tick.take(now);
    const inFlight = counters.started - counters.done;
    opts.onProgress?.({ done: counters.done, inFlight, elapsedMs: now - start, window, ...load.live() });
  };
  const timer = setInterval(report, opts.progressMs ?? 500);
  try {
    const samples = await load.done;
    report();
    return { ...summarize(samples.filter((s) => s !== null), performance.now() - start), ...load.final() };
  } finally {
    clearInterval(timer);
  }
}
