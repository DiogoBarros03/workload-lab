// C05 box 2: a hung downstream must become a 504 within DOWNSTREAM_TIMEOUT_MS + 50 ms.
// Measured, not asserted-away: sim timeout_rate 1 makes every call hang for 30 s.
import { num, putConfig, resetStats, startStack } from "./stack.mjs";

const SIM_PORT = num("MEASURE_SIM_PORT", 8097);
const API_PORT = num("MEASURE_PORT", 8098);
const TIMEOUT_MS = num("DOWNSTREAM_TIMEOUT_MS", 500);
const SAMPLES = num("MEASURE_SAMPLES", 5);
const BUDGET = TIMEOUT_MS + 50;

const probe = async (base, path) => {
  const started = performance.now();
  const res = await fetch(base + path);
  await res.arrayBuffer();
  return { status: res.status, elapsed: Math.round(performance.now() - started) };
};

const stack = await startStack({ simPort: SIM_PORT, apiPort: API_PORT, timeoutMs: TIMEOUT_MS });
await putConfig(stack.simBase, { timeout_rate: 1 });
await resetStats(stack.simBase);

console.log(`DOWNSTREAM_TIMEOUT_MS=${TIMEOUT_MS} budget=${BUDGET}ms samples=${SAMPLES}`);
console.log("path                       sample  status  elapsed_ms  within_budget");

let violations = 0;
for (const path of ["/io?ms=0&jitter=0", "/fanout?n=3&mode=parallel"]) {
  for (let i = 1; i <= SAMPLES; i += 1) {
    const { status, elapsed } = await probe(stack.apiBase, path);
    const ok = status === 504 && elapsed <= BUDGET;
    if (!ok) violations += 1;
    console.log(
      `${path.padEnd(27)}${String(i).padStart(6)}${String(status).padStart(8)}` +
        `${String(elapsed).padStart(12)}  ${ok ? "yes" : "NO"}`,
    );
  }
}

stack.stop();
console.log(violations === 0 ? "\nok — every probe was a 504 inside the budget" : `\nFAIL — ${violations}`);
process.exit(violations === 0 ? 0 : 1);
