// Spawns the real sim and the real api as children, so one command reproduces an arm.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const SIM = fileURLToPath(new URL("../../downstream-sim/src/server.ts", import.meta.url));
const API = fileURLToPath(new URL("../src/server.ts", import.meta.url));

export const num = (name, fallback) => Number(process.env[name] ?? fallback);

const child = (entry, env) =>
  spawn(process.execPath, [entry], {
    env: { ...process.env, LOG_LEVEL: process.env.LOG_LEVEL ?? "warn", ...env },
    stdio: ["ignore", "inherit", "inherit"],
  });

export async function waitForUp(base) {
  for (let i = 0; i < 200; i += 1) {
    const ok = await fetch(`${base}/healthz`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await sleep(50);
  }
  throw new Error(`never became healthy: ${base}`);
}

// DOWNSTREAM_URL and DOWNSTREAM_TIMEOUT_MS are knobs — set once here, never mid-run.
export async function startStack({ simPort, apiPort, timeoutMs }) {
  const sim = child(SIM, { PORT: String(simPort) });
  const api = child(API, {
    PORT: String(apiPort),
    DOWNSTREAM_URL: `http://127.0.0.1:${simPort}`,
    DOWNSTREAM_TIMEOUT_MS: String(timeoutMs),
  });
  const simBase = `http://127.0.0.1:${simPort}`;
  const apiBase = `http://127.0.0.1:${apiPort}`;
  await Promise.all([waitForUp(simBase), waitForUp(apiBase)]);
  return {
    simBase,
    apiBase,
    stop: () => {
      sim.kill("SIGTERM");
      api.kill("SIGTERM");
    },
  };
}

const json = (url, init) => fetch(url, init).then((r) => r.json());

export const putConfig = (simBase, config) =>
  json(`${simBase}/config`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });

export const resetStats = (simBase) => json(`${simBase}/stats`, { method: "DELETE" });
export const readStats = (simBase) => json(`${simBase}/stats`);
