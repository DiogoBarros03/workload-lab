// C06 box 1: /io against a sim failing half its calls, with RETRY_MAX off and on.
// A retry converts a downstream failure into latency; this measures both sides of that trade.
import { cpus } from "node:os";

import autocannon from "autocannon";

import { num, putConfig, readStats, resetStats, startStack } from "./stack.mjs";

const SIM_PORT = num("MEASURE_SIM_PORT", 8097);
const API_PORT = num("MEASURE_PORT", 8098);
const DURATION = num("MEASURE_DURATION", 10);
const WARMUP = num("MEASURE_WARMUP", 3);
const CONNECTIONS = num("MEASURE_CONNECTIONS", 10);
const LATENCY_MS = num("MEASURE_LATENCY_MS", 20);
const ERROR_RATE = Number(process.env.MEASURE_ERROR_RATE ?? 0.5);
const TIMEOUT_MS = num("DOWNSTREAM_TIMEOUT_MS", 1000);
const BACKOFF_MS = num("RETRY_BACKOFF_MS", 20);
const SEED = num("MEASURE_SEED", 1);
const RUNS = num("MEASURE_RUNS", 3);
const BUDGET = Number(process.env.MEASURE_ERROR_BUDGET ?? 15);
const ARMS = (process.env.MEASURE_RETRY_MAX ?? "0,3").split(",");

const PATH = `/io?ms=${LATENCY_MS}&jitter=0`;

const fire = (base, duration) =>
  autocannon({ url: base + PATH, connections: CONNECTIONS, duration, title: PATH });

// One variable per arm: RETRY_MAX. Everything else, seed included, is pinned.
async function arm(retryMax) {
  const stack = await startStack({
    simPort: SIM_PORT,
    apiPort: API_PORT,
    timeoutMs: TIMEOUT_MS,
    apiEnv: {
      RETRY_MAX: retryMax,
      RETRY_BACKOFF_MS: String(BACKOFF_MS),
      BREAKER: "off",
      // The load generator hangs up on its own connections; do not wait 10 s for a clean drain.
      GRACEFUL_SHUTDOWN_MS: "2000",
    },
  });
  try {
    await putConfig(stack.simBase, {
      latency_ms: LATENCY_MS,
      error_rate: ERROR_RATE,
      rate_limit_rps: 0,
      seed: SEED,
    });
    await fire(stack.apiBase, WARMUP);
    await resetStats(stack.simBase);
    const result = await fire(stack.apiBase, DURATION);
    const sim = await readStats(stack.simBase);
    const total = result["2xx"] + result.non2xx;
    return {
      rps: Number(result.requests.average.toFixed(1)),
      p50: result.latency.p50,
      p99: result.latency.p99,
      requests: total,
      non2xx: result.non2xx,
      errorPct: Number(((result.non2xx / total) * 100).toFixed(2)),
      simCalls: sim.calls,
      amplification: Number((sim.calls / total).toFixed(2)),
    };
  } finally {
    await stack.stop();
  }
}

console.log(
  `host=${process.platform} node=${process.version} cpus=${cpus().length} ` +
    `duration=${DURATION}s connections=${CONNECTIONS} sim_error_rate=${ERROR_RATE} seed=${SEED} ` +
    `DOWNSTREAM_TIMEOUT_MS=${TIMEOUT_MS} RETRY_BACKOFF_MS=${BACKOFF_MS} budget=${BUDGET}%`,
);
console.log("\nrun  RETRY_MAX  rps       p50     p99  requests  non2xx  error_%  sim_calls  calls/req");

let worst = 0;
for (let run = 1; run <= RUNS; run += 1) {
  for (const retryMax of ARMS) {
    const d = await arm(retryMax);
    if (Number(retryMax) > 0) worst = Math.max(worst, d.errorPct);
    console.log(
      `${String(run).padEnd(5)}${retryMax.padEnd(11)}${String(d.rps).padStart(7)}` +
        `${String(d.p50).padStart(8)}${String(d.p99).padStart(8)}${String(d.requests).padStart(10)}` +
        `${String(d.non2xx).padStart(8)}${String(d.errorPct).padStart(9)}` +
        `${String(d.simCalls).padStart(11)}${String(d.amplification).padStart(11)}`,
    );
  }
}

const ok = worst < BUDGET;
console.log(
  ok
    ? `\nok — worst retrying arm was ${worst}% client-visible error, under the ${BUDGET}% budget`
    : `\nFAIL — worst retrying arm was ${worst}%, over the ${BUDGET}% budget`,
);
process.exit(ok ? 0 : 1);
