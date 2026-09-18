// C06 boxes 2 and 3: the breaker opens on consecutive failures, answers 503 without calling
// the sim, then half-opens and recovers. PUT /outage is the deterministic input — N failures
// to the millisecond, recovering on its own, so no second touch of the sim is needed.
import { cpus } from "node:os";

import { num, putConfig, readStats, resetStats, startStack } from "./stack.mjs";

const SIM_PORT = num("MEASURE_SIM_PORT", 8097);
const API_PORT = num("MEASURE_PORT", 8098);
const THRESHOLD = num("BREAKER_FAILURE_THRESHOLD", 3);
const RESET_MS = num("BREAKER_RESET_MS", 400);
const OUTAGE_MS = num("MEASURE_OUTAGE_MS", 1200);
const TIMEOUT_MS = num("DOWNSTREAM_TIMEOUT_MS", 1000);
const LATENCY_MS = num("MEASURE_LATENCY_MS", 5);
const SEED = num("MEASURE_SEED", 1);
const OPEN_PROBES = num("MEASURE_OPEN_PROBES", 20);
const FAST_MS = num("MEASURE_FAST_MS", 5);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(base, path) {
  const started = performance.now();
  const res = await fetch(base + path);
  await res.arrayBuffer();
  return { status: res.status, elapsed: Number((performance.now() - started).toFixed(2)) };
}

const stack = await startStack({
  simPort: SIM_PORT,
  apiPort: API_PORT,
  timeoutMs: TIMEOUT_MS,
  // Retries off so a failed call is one sim call: the threshold is then countable by hand.
  apiEnv: {
    RETRY_MAX: "0",
    BREAKER: "on",
    BREAKER_FAILURE_THRESHOLD: String(THRESHOLD),
    BREAKER_RESET_MS: String(RESET_MS),
  },
});
await putConfig(stack.simBase, { latency_ms: LATENCY_MS, rate_limit_rps: 0, seed: SEED });

console.log(
  `host=${process.platform} node=${process.version} cpus=${cpus().length} ` +
    `BREAKER=on BREAKER_FAILURE_THRESHOLD=${THRESHOLD} BREAKER_RESET_MS=${RESET_MS} ` +
    `RETRY_MAX=0 outage_ms=${OUTAGE_MS} seed=${SEED} fast_budget=${FAST_MS}ms`,
);

const failures = [];
let violations = 0;
const check = (label, ok, detail) => {
  if (!ok) failures.push(label);
  console.log(`${ok ? "ok  " : "FAIL"}  ${label.padEnd(46)} ${detail}`);
};

// A — healthy: the breaker is closed and invisible.
await resetStats(stack.simBase);
const healthy = [];
for (let i = 0; i < 3; i += 1) healthy.push((await probe(stack.apiBase, "/io")).status);
check("A healthy /io is 200 with the breaker on", healthy.every((s) => s === 200), healthy.join(","));

// B — outage: count the failures it takes to open, and the sim calls they cost.
await resetStats(stack.simBase);
await fetch(`${stack.simBase}/outage`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ duration_ms: OUTAGE_MS }),
});

let before503 = 0;
for (let i = 0; i < THRESHOLD + 5; i += 1) {
  const { status } = await probe(stack.apiBase, "/io");
  if (status === 503) break;
  before503 += 1;
}
const opened = await readStats(stack.simBase);
check(
  `B opens after exactly ${THRESHOLD} consecutive failures`,
  before503 === THRESHOLD,
  `502s=${before503} sim_calls=${opened.calls} sim_outage=${opened.outage}`,
);

// C — open: 503 fast, and the sim hears nothing. This is the whole point of a breaker.
const callsAtOpen = (await readStats(stack.simBase)).calls;
const slow = [];
let worst = 0;
for (let i = 0; i < OPEN_PROBES; i += 1) {
  const path = i % 4 === 3 ? "/fanout?n=5&mode=parallel" : "/io";
  const { status, elapsed } = await probe(stack.apiBase, path);
  worst = Math.max(worst, elapsed);
  if (status !== 503 || elapsed > FAST_MS) slow.push(`${path}:${status}/${elapsed}ms`);
}
const callsAfterOpen = (await readStats(stack.simBase)).calls;
check(
  `C ${OPEN_PROBES} probes while open are 503 in < ${FAST_MS} ms`,
  slow.length === 0,
  `worst=${worst}ms offenders=${slow.length ? slow.join(" ") : "none"}`,
);
check(
  "C sim call count does not increase while open",
  callsAfterOpen === callsAtOpen,
  `before=${callsAtOpen} after=${callsAfterOpen}`,
);
violations += slow.length;

// D — recovery: half-open probes keep failing until the outage lifts, then it closes itself.
const startedAt = performance.now();
let recoveredMs = null;
const timeline = [];
for (let i = 0; i < 60 && recoveredMs === null; i += 1) {
  const { status } = await probe(stack.apiBase, "/io");
  timeline.push(status);
  if (status === 200) recoveredMs = Math.round(performance.now() - startedAt);
  else await sleep(50);
}
const after = [];
for (let i = 0; i < 5; i += 1) after.push((await probe(stack.apiBase, "/io")).status);

check(
  "D half-opens and recovers with no restart",
  recoveredMs !== null && after.every((s) => s === 200),
  `recovered_after=${recoveredMs}ms tail=${after.join(",")} states=${timeline.join("")}`,
);

stack.stop();
const ok = failures.length === 0 && violations === 0;
console.log(ok ? "\nok — every breaker box measured green" : `\nFAIL — ${failures.join("; ")}`);
process.exit(ok ? 0 : 1);
