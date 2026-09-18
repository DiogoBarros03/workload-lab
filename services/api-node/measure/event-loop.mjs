// The C04 result: how far a synchronous `/cpu` blocks concurrent `/healthz`. Self-contained —
// spawns the real app, drives it with autocannon (ADR 0006), prints one row per run.
import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

import autocannon from "autocannon";

import { buildApp, start } from "../src/app.ts";

const num = (name, fallback) => Number(process.env[name] ?? fallback);

const PORT = num("MEASURE_PORT", 8098);
const DURATION = num("MEASURE_DURATION", 10);
const WARMUP = num("MEASURE_WARMUP", 3);
const HEALTH_CONNECTIONS = num("MEASURE_HEALTH_CONNECTIONS", 10);
const CPU_CONNECTIONS = num("MEASURE_CPU_CONNECTIONS", 2);
const CPU_MS = num("MEASURE_CPU_MS", 200);
const RUNS = num("MEASURE_RUNS", 3);
const RAW = process.env.MEASURE_RAW ?? "results/raw/001-node-event-loop.json";
const base = `http://127.0.0.1:${PORT}`;

const fire = (path, connections, duration) =>
  autocannon({ url: base + path, connections, duration, title: path });

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

async function waitForUp() {
  for (let i = 0; i < 100; i += 1) {
    const ok = await fetch(`${base}/healthz`).then((r) => r.ok).catch(() => false);
    if (ok) return;
    await sleep(50);
  }
  throw new Error("server never became healthy");
}

// One variable per run: the only difference between the two arms is whether /cpu is loaded.
async function oneRun() {
  const baseline = digest(await fire("/healthz", HEALTH_CONNECTIONS, DURATION));
  const [health, cpu] = await Promise.all([
    fire("/healthz", HEALTH_CONNECTIONS, DURATION),
    fire(`/cpu?ms=${CPU_MS}`, CPU_CONNECTIONS, DURATION),
  ]);
  return { baseline, contended: digest(health), cpu: digest(cpu) };
}

function row(run, label, d) {
  console.log(
    `${String(run).padEnd(4)}${label.padEnd(12)}${String(d.rps).padStart(9)}` +
      `${String(d.mean).padStart(9)}${String(d.p50).padStart(8)}${String(d.p97_5).padStart(8)}${String(d.p99).padStart(8)}${String(d.max).padStart(8)}` +
      `${String(d.non2xx).padStart(8)}${String(d.errors).padStart(8)}`,
  );
}

async function drive() {
  const child = spawn(process.execPath, [import.meta.filename, "serve"], {
    env: { ...process.env, PORT: String(PORT), LOG_LEVEL: process.env.LOG_LEVEL ?? "warn" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  await waitForUp();

  console.log(
    `host=${process.platform} node=${process.version} cpus=${cpus().length} ` +
      `duration=${DURATION}s health_conns=${HEALTH_CONNECTIONS} cpu_conns=${CPU_CONNECTIONS} cpu_ms=${CPU_MS}`,
  );
  await fire("/healthz", HEALTH_CONNECTIONS, WARMUP);
  await fire(`/cpu?ms=${CPU_MS}`, CPU_CONNECTIONS, WARMUP);
  console.log(`warm-up (${WARMUP}s per arm) discarded\n`);

  console.log("run arm              rps     mean     p50   p97.5     p99     max  non2xx  errors");
  const runs = [];
  for (let i = 1; i <= RUNS; i += 1) {
    const result = await oneRun();
    row(i, "healthz", result.baseline);
    row(i, "healthz+cpu", result.contended);
    row(i, "cpu", result.cpu);
    runs.push(result);
  }

  await mkdir(RAW.replace(/\/[^/]*$/, ""), { recursive: true });
  await writeFile(RAW, JSON.stringify({ node: process.version, cpuMs: CPU_MS, runs }, null, 2));
  console.log(`\nraw: ${RAW}`);
  child.kill("SIGTERM");
}

if (process.argv[2] === "serve") {
  await start(buildApp());
} else {
  await drive();
}
