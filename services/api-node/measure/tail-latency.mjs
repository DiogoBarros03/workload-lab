// The C05 result: fanout n=10 parallel p99 against single-call p99, same latency distribution.
// A fanout finishes when its slowest call finishes, so it trades the sim's median for its tail.
import { cpus } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";

import autocannon from "autocannon";

import { num, putConfig, readStats, resetStats, startStack } from "./stack.mjs";

const SIM_PORT = num("MEASURE_SIM_PORT", 8097);
const API_PORT = num("MEASURE_PORT", 8098);
const DURATION = num("MEASURE_DURATION", 10);
const WARMUP = num("MEASURE_WARMUP", 3);
const CONNECTIONS = num("MEASURE_CONNECTIONS", 10);
const LATENCY_MS = num("MEASURE_LATENCY_MS", 100);
const JITTER_MS = num("MEASURE_JITTER_MS", 80);
const FANOUT_N = num("MEASURE_FANOUT_N", 10);
// High enough that no arm can 504; the timeout budget is measured by measure/timeout.mjs.
const TIMEOUT_MS = num("DOWNSTREAM_TIMEOUT_MS", 10_000);
const RUNS = num("MEASURE_RUNS", 3);
const RAW = process.env.MEASURE_RAW ?? "results/raw/002-tail-latency.json";

const ARMS = [
  ["single", `/io?ms=${LATENCY_MS}&jitter=${JITTER_MS}`],
  ["fanout-par", `/fanout?n=${FANOUT_N}&mode=parallel`],
  ["fanout-ser", `/fanout?n=${FANOUT_N}&mode=serial`],
];

const digest = (result) => ({
  rps: Number(result.requests.average.toFixed(1)),
  mean: result.latency.mean,
  p50: result.latency.p50,
  p97_5: result.latency.p97_5,
  p99: result.latency.p99,
  max: result.latency.max,
  non2xx: result.non2xx,
  errors: result.errors + result.timeouts,
});

const fire = (base, path, duration) =>
  autocannon({ url: base + path, connections: CONNECTIONS, duration, title: path });

// One variable per arm: the number of downstream calls one request makes, and how they overlap.
async function oneArm(stack, path) {
  await resetStats(stack.simBase);
  const result = digest(await fire(stack.apiBase, path, DURATION));
  const sim = await readStats(stack.simBase);
  return { ...result, simCalls: sim.calls, simOk: sim.ok, sim429: sim.rate_limited };
}

function row(run, label, d) {
  console.log(
    `${String(run).padEnd(4)}${label.padEnd(12)}${String(d.rps).padStart(9)}` +
      `${String(d.mean).padStart(9)}${String(d.p50).padStart(8)}${String(d.p97_5).padStart(8)}` +
      `${String(d.p99).padStart(8)}${String(d.max).padStart(8)}${String(d.non2xx).padStart(8)}` +
      `${String(d.errors).padStart(8)}${String(d.simCalls).padStart(11)}${String(d.sim429).padStart(7)}`,
  );
}

const stack = await startStack({ simPort: SIM_PORT, apiPort: API_PORT, timeoutMs: TIMEOUT_MS });
// rate_limit_rps 0 disables the bucket: a 429 storm would measure the limiter, not the tail.
const config = await putConfig(stack.simBase, {
  latency_ms: LATENCY_MS,
  jitter_ms: JITTER_MS,
  rate_limit_rps: 0,
});

console.log(
  `host=${process.platform} node=${process.version} cpus=${cpus().length} ` +
    `duration=${DURATION}s connections=${CONNECTIONS} n=${FANOUT_N} ` +
    `sim=${JSON.stringify(config)} DOWNSTREAM_TIMEOUT_MS=${TIMEOUT_MS}`,
);
for (const [, path] of ARMS) await fire(stack.apiBase, path, WARMUP);
console.log(`warm-up (${WARMUP}s per arm) discarded\n`);

console.log(
  "run arm               rps     mean     p50   p97.5     p99     max  non2xx  errors  sim_calls  429",
);
const runs = [];
for (let i = 1; i <= RUNS; i += 1) {
  const result = {};
  for (const [label, path] of ARMS) {
    result[label] = await oneArm(stack, path);
    row(i, label, result[label]);
  }
  runs.push(result);
}

await mkdir(RAW.replace(/\/[^/]*$/, ""), { recursive: true });
await writeFile(
  RAW,
  JSON.stringify(
    { node: process.version, sim: config, connections: CONNECTIONS, n: FANOUT_N, runs },
    null,
    2,
  ),
);
console.log(`\nraw: ${RAW}`);
stack.stop();
