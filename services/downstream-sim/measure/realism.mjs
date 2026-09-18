// The three C02b acceptance boxes, measured against a sim this script starts itself.
// Box 4 (uniform untouched) is measure/acceptance.mjs, run unchanged.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("../src/server.ts", import.meta.url));
const num = (name, fallback) => Number(process.env[name] ?? fallback);

const PORT = num("MEASURE_SIM_PORT", 8099);
const SAMPLES = num("MEASURE_SAMPLES", 1000);
const CONCURRENCY = num("MEASURE_CONCURRENCY", 20);
const OUTAGE_MS = num("MEASURE_OUTAGE_MS", 3000);
const SEED = num("MEASURE_SEED", 1234);
const base = `http://127.0.0.1:${PORT}`;

const json = (url, init) => fetch(url, init).then((r) => r.json());
const put = (path, body) =>
  json(`${base}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const resetStats = () => json(`${base}/stats`, { method: "DELETE" });

async function start() {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), LOG_LEVEL: "warn" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  for (let i = 0; i < 200; i += 1) {
    if (await fetch(`${base}/healthz`).then((r) => r.ok).catch(() => false)) return child;
    await sleep(50);
  }
  throw new Error("sim never became healthy");
}

async function timedCall() {
  const started = performance.now();
  const response = await fetch(`${base}/call`);
  const body = await response.json();
  return { elapsed: performance.now() - started, status: response.status, drawn: body.latency_ms };
}

async function pool(total, concurrency, task) {
  const results = [];
  let issued = 0;
  const worker = async () => {
    while (issued < total) {
      issued += 1;
      results.push(await task());
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const row = (cells) => cells.map((c, i) => (i ? String(c).padStart(9) : String(c).padEnd(24))).join("");

// Box 1 — lognormal vs uniform at the same latency_ms, one table.
async function boxShapes() {
  console.log(`\nbox1 — latency shape (n=${SAMPLES}, concurrency=${CONCURRENCY}, seed=${SEED})`);
  console.log(row(["arm", "p50", "p90", "p99", "max", "mean"]));
  for (const jitter_ms of [20, 80]) {
    for (const latency_shape of ["uniform", "lognormal"]) {
      await put("/config", { latency_ms: 100, jitter_ms, latency_shape, seed: SEED });
      await resetStats();
      const samples = await pool(SAMPLES, CONCURRENCY, timedCall);
      const drawn = samples.map((s) => s.drawn);
      const wall = samples.map((s) => s.elapsed);
      const mean = drawn.reduce((a, b) => a + b, 0) / drawn.length;
      console.log(
        row([
          `${latency_shape} j=${jitter_ms}`,
          percentile(drawn, 50),
          percentile(drawn, 90),
          percentile(drawn, 99),
          Math.max(...drawn),
          mean.toFixed(1),
        ]) + `   wall p50=${percentile(wall, 50).toFixed(0)} p99=${percentile(wall, 99).toFixed(0)}`,
      );
    }
  }
}

// Box 2 — the same seed replays the sequence; a different seed does not. Sequential on purpose.
async function boxSeed() {
  const sequence = async (seed) => {
    await put("/config", { latency_ms: 100, jitter_ms: 80, latency_shape: "lognormal", seed });
    const out = [];
    for (let i = 0; i < 10; i += 1) out.push((await timedCall()).drawn);
    return out;
  };
  const a1 = await sequence(SEED);
  const a2 = await sequence(SEED);
  const b1 = await sequence(SEED + 1);
  const same = JSON.stringify(a1) === JSON.stringify(a2);
  const differs = JSON.stringify(a1) !== JSON.stringify(b1);
  console.log(`\nbox2 — seeded draws (lognormal, latency_ms=100, jitter_ms=80)`);
  console.log(`seed=${SEED} run A : ${a1.join(" ")}`);
  console.log(`seed=${SEED} run B : ${a2.join(" ")}`);
  console.log(`seed=${SEED + 1}      : ${b1.join(" ")}`);
  console.log(`replays=${same} diverges_on_new_seed=${differs}`);
  return same && differs;
}

// Box 3 — every call fails for the window, then recovery happens with no restart.
async function boxOutage() {
  await put("/config", {});
  await resetStats();
  const before = await timedCall();
  const t0 = performance.now();
  await put("/outage", { duration_ms: OUTAGE_MS });

  const probes = [];
  while (performance.now() - t0 < OUTAGE_MS + 1000) {
    probes.push({ t: performance.now() - t0, ...(await timedCall()) });
    await sleep(5);
  }
  const failing = probes.filter((p) => p.status === 503);
  const recovered = probes.filter((p) => p.t > failing.at(-1).t && p.status === 200);
  const leaked = probes.filter((p) => p.t < failing.at(-1).t && p.status !== 503);
  const stats = await json(`${base}/stats`);

  console.log(`\nbox3 — outage (duration_ms=${OUTAGE_MS})`);
  console.log(`pre-outage call        : ${before.status}`);
  console.log(`probes                 : ${probes.length} (${failing.length} x 503)`);
  console.log(`first 503 at           : ${failing[0].t.toFixed(1)} ms`);
  console.log(`last 503 at            : ${failing.at(-1).t.toFixed(1)} ms`);
  console.log(`first 200 after        : ${recovered[0].t.toFixed(1)} ms`);
  console.log(`non-503 inside window  : ${leaked.length}`);
  console.log(`recovery error vs ${OUTAGE_MS} : ${(recovered[0].t - OUTAGE_MS).toFixed(1)} ms`);
  console.log(`stats                  : ${JSON.stringify(stats)}`);
  const within = Math.abs(recovered[0].t - OUTAGE_MS) <= 100;
  console.log(`within_100ms=${within} no_leaks=${leaked.length === 0} burst_counted=${stats.outage === failing.length}`);
  return within && leaked.length === 0 && stats.outage === failing.length;
}

const sim = await start();
try {
  await boxShapes();
  const seeded = await boxSeed();
  const outage = await boxOutage();
  console.log(`\nbox2 ${seeded ? "ok" : "FAIL"} · box3 ${outage ? "ok" : "FAIL"}`);
  process.exitCode = seeded && outage ? 0 : 1;
} finally {
  sim.kill("SIGTERM");
}
