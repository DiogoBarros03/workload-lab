import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, test, vi } from "vitest";

import { buildApp, start } from "./app.ts";
import type { Api } from "./app.ts";

type Sim = { url: string; hits: string[]; close: () => Promise<void> };

const json = (_req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
};

const fail = (_req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(500).end("boom");
};

// A fake, not a stub: a real HTTP server, so fetch, sockets and the deadline are all real.
async function startSim(handler = json): Promise<Sim> {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url ?? "");
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    hits,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

// A port nothing listens on: the connection-refused branch, which is not a timeout.
const DEAD_URL = "http://127.0.0.1:1";

const opened: { close: () => Promise<void> }[] = [];
let apis: Api[] = [];

function build(env: Record<string, string>): Api {
  const previous = { ...process.env };
  Object.assign(process.env, { LOG_LEVEL: "silent" }, env);
  const api = buildApp();
  process.env = previous;
  apis.push(api);
  return api;
}

afterEach(async () => {
  await Promise.all(apis.map((api) => api.app.close()));
  apis = [];
  await Promise.all(opened.splice(0).map((sim) => sim.close()));
});

async function sim(handler = json): Promise<Sim> {
  const started = await startSim(handler);
  opened.push(started);
  return started;
}

describe("probes", () => {
  test("healthz is 200 regardless of phase, readyz follows the phase", async () => {
    const api = build({});
    expect((await api.app.inject("/readyz")).json()).toEqual({ status: "starting" });
    expect((await api.app.inject("/readyz")).statusCode).toBe(503);

    api.setPhase("ok");
    expect((await api.app.inject("/readyz")).statusCode).toBe(200);
    expect((await api.app.inject("/healthz")).json()).toEqual({ status: "ok" });
  });

  test("metrics is well-formed Prometheus exposition and empty until C08", async () => {
    const res = await build({}).app.inject("/metrics");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/plain; version=0.0.4; charset=utf-8");
    expect(res.body).toBe("");
  });

  test("every response carries a request id, echoing the caller's when given", async () => {
    const api = build({});
    const generated = await api.app.inject("/healthz");
    expect(generated.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

    const echoed = await api.app.inject({ url: "/healthz", headers: { "x-request-id": "abc-123" } });
    expect(echoed.headers["x-request-id"]).toBe("abc-123");
  });
});

describe("shutting down", () => {
  test("work is refused with 503 while the probes keep answering", async () => {
    const api = build({});
    api.setPhase("shutting_down");

    const refused = await api.app.inject("/cpu?ms=0");
    expect(refused.statusCode).toBe(503);
    expect(refused.json()).toEqual({ error: "shutting_down" });

    expect((await api.app.inject("/healthz")).statusCode).toBe(200);
    expect((await api.app.inject("/readyz")).statusCode).toBe(503);
    expect((await api.app.inject("/metrics")).statusCode).toBe(200);
  });

  test("the drain empties once the request has responded", async () => {
    const api = build({});
    await api.app.inject("/healthz");
    expect(api.drain.inflight()).toBe(0);
  });
});

describe("/cpu", () => {
  test("defaults to burning nothing", async () => {
    const res = await build({}).app.inject("/cpu");
    expect(res.json()).toMatchObject({ ms: 0, rounds: 0 });
  });

  test("burns for the requested wall time", async () => {
    const res = await build({}).app.inject("/cpu?ms=30&rounds=50");
    expect(res.json().ms).toBeGreaterThanOrEqual(30);
    expect(res.json().hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a negative ms is rejected, not coerced", async () => {
    expect((await build({}).app.inject("/cpu?ms=-1")).statusCode).toBe(400);
  });
});

describe("/memory", () => {
  test("reports the megabytes it actually held", async () => {
    const res = await build({}).app.inject("/memory?mb=2&hold_ms=0");
    expect(res.json()).toEqual({ mb: 2, hold_ms: 0 });
  });

  test("mb=0 is allowed but a negative one is not", async () => {
    const api = build({});
    expect((await api.app.inject("/memory?mb=0&hold_ms=0")).json()).toEqual({ mb: 0, hold_ms: 0 });
    expect((await api.app.inject("/memory?mb=-1")).statusCode).toBe(400);
  });
});

describe("/io", () => {
  test("calls the sim once and passes its latency parameters through", async () => {
    const downstream = await sim();
    const res = await build({ DOWNSTREAM_URL: downstream.url }).app.inject("/io?ms=100&jitter=20");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ attempts: 1 });
    expect(downstream.hits).toEqual(["/call?latency_ms=100&jitter_ms=20"]);
  });

  test("a downstream that never answers becomes a 504 at the deadline", async () => {
    const downstream = await sim(() => {});
    const api = build({ DOWNSTREAM_URL: downstream.url, DOWNSTREAM_TIMEOUT_MS: "150" });

    const started = performance.now();
    const res = await api.app.inject("/io");

    expect(res.statusCode).toBe(504);
    expect(res.json()).toEqual({ error: "downstream_timeout" });
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test("a refused connection is a 500, not a 504 — only the deadline is a timeout", async () => {
    const res = await build({ DOWNSTREAM_URL: DEAD_URL }).app.inject("/io");
    expect(res.statusCode).toBe(500);
  });
});

describe("/fanout", () => {
  test("n parallel calls, no latency override, all counted ok", async () => {
    const downstream = await sim();
    const res = await build({ DOWNSTREAM_URL: downstream.url }).app.inject(
      "/fanout?n=3&mode=parallel",
    );

    expect(res.json()).toMatchObject({ n: 3, mode: "parallel", ok: 3, failed: 0 });
    expect(downstream.hits).toEqual(["/call", "/call", "/call"]);
  });

  test("a 5xx from the sim is a failed call, not a failed request", async () => {
    const downstream = await sim(fail);
    const res = await build({ DOWNSTREAM_URL: downstream.url }).app.inject("/fanout?n=2&mode=serial");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ n: 2, mode: "serial", ok: 0, failed: 2 });
  });

  test("the deadline covers all n calls and answers 504", async () => {
    const downstream = await sim(() => {});
    const api = build({ DOWNSTREAM_URL: downstream.url, DOWNSTREAM_TIMEOUT_MS: "150" });

    const res = await api.app.inject("/fanout?n=4&mode=parallel");
    expect(res.statusCode).toBe(504);
    expect(res.json()).toEqual({ error: "downstream_timeout" });
  });

  test("mode must be one of the two the contract names", async () => {
    expect((await build({}).app.inject("/fanout?n=1&mode=sideways")).statusCode).toBe(400);
  });
});

describe("start", () => {
  // Real listen on an ephemeral port; process.exit is spied so the drain can finish.
  async function listening(graceMs: string) {
    const api = build({});
    const before = process.listeners("SIGINT");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    process.env.PORT = "0";
    process.env.GRACEFUL_SHUTDOWN_MS = graceMs;
    await start(api);
    delete process.env.PORT;
    delete process.env.GRACEFUL_SHUTDOWN_MS;
    return { api, exit, before };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    for (const listener of process.listeners("SIGINT")) {
      process.removeListener("SIGINT", listener as () => void);
    }
    for (const listener of process.listeners("SIGTERM")) {
      process.removeListener("SIGTERM", listener as () => void);
    }
  });

  test("listening flips the phase to ok and SIGTERM drains then exits 0", async () => {
    const { api, exit } = await listening("2000");
    expect(api.phase()).toBe("ok");
    expect((await api.app.inject("/readyz")).statusCode).toBe(200);

    process.emit("SIGTERM");
    expect(api.phase()).toBe("shutting_down");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  });

  test("a second signal during the drain is ignored, not a second shutdown", async () => {
    const { api, exit } = await listening("2000");

    process.emit("SIGTERM");
    process.emit("SIGINT");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    expect(exit).toHaveBeenCalledTimes(1);
    expect(api.phase()).toBe("shutting_down");
  });
});
