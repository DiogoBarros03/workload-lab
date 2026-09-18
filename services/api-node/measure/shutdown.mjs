// The C03 shutdown acceptance box, measured for real. `serve` runs the real app plus one
// slow route, because no slow endpoint exists until C04.
import { setTimeout as sleep } from "node:timers/promises";
import { spawn } from "node:child_process";

import { buildApp, start } from "../src/app.ts";

const PORT = Number(process.env.SHUTDOWN_DEMO_PORT ?? 8099);
const GRACE_MS = Number(process.env.GRACEFUL_SHUTDOWN_MS ?? 5000);
const base = `http://127.0.0.1:${PORT}`;

if (process.argv[2] === "serve") {
  const api = buildApp();
  api.app.get("/__slow", async (request) => {
    await sleep(Number(request.query.ms ?? 2000));
    return { slow: true };
  });
  await start(api);
} else {
  await drive();
}

async function probe(path) {
  try {
    const res = await fetch(base + path);
    return { status: res.status, body: await res.text() };
  } catch (error) {
    return { status: 0, body: `${error.cause?.code ?? error.code ?? error.message}` };
  }
}

async function waitForUp() {
  for (let i = 0; i < 100; i += 1) {
    if ((await probe("/healthz")).status === 200) return;
    await sleep(50);
  }
  throw new Error("server never became healthy");
}

function check(label, ok, detail) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${label} — ${detail}`);
  return ok;
}

async function drive() {
  const child = spawn(process.execPath, [import.meta.filename, "serve"], {
    env: { ...process.env, PORT: String(PORT), GRACEFUL_SHUTDOWN_MS: String(GRACE_MS) },
    stdio: ["ignore", "inherit", "inherit"],
  });
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));

  await waitForUp();
  const inflight = probe("/__slow?ms=2000");
  await sleep(200);

  const t0 = performance.now();
  child.kill("SIGTERM");
  await sleep(100);

  const [ready, live, refused] = await Promise.all([
    probe("/readyz"),
    probe("/healthz"),
    probe("/__slow?ms=0"),
  ]);
  const slow = await inflight;
  const code = await exited;
  const elapsed = Math.round(performance.now() - t0);

  const results = [
    check("in-flight request completed", slow.status === 200, `GET /__slow -> ${slow.status} ${slow.body}`),
    check("new request refused", refused.status === 503 || refused.status === 0, `GET /__slow -> ${refused.status} ${refused.body}`),
    check("/readyz is 503 while draining", ready.status === 503, `GET /readyz -> ${ready.status} ${ready.body}`),
    check("/healthz still 200 while draining", live.status === 200, `GET /healthz -> ${live.status} ${live.body}`),
    check("exit code 0", code === 0, `exit=${code}`),
    check(`exit within GRACEFUL_SHUTDOWN_MS=${GRACE_MS}`, elapsed < GRACE_MS, `${elapsed}ms`),
  ];

  console.log(`\nshutdown: ${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
