import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handle, parsePs, makeCompose } from "./operator.mjs";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const RUNNING = fixture("ps-all-running.ndjson");
const STOPPED = fixture("ps-api-db-stopped.ndjson");
const PS_ARGS = ["ps", "--format", "json", "-a"];

// Fake compose: records calls, answers ps with `psOut`, others with `result`.
function fakeDeps({ result = { code: 0, stdout: "", stderr: "" }, psOut = RUNNING, times = [0, 0] } = {}) {
  const calls = [];
  const clock = [...times];
  return {
    calls,
    project: "learning",
    now: () => (clock.length > 1 ? clock.shift() : clock[0]),
    compose: async (args) => {
      calls.push(args);
      return args[0] === "ps" ? { code: 0, stdout: psOut, stderr: "" } : result;
    },
  };
}

const post = (path, body, origin) => ({ method: "POST", path, body: JSON.stringify(body), origin });
const get = (path, origin) => ({ method: "GET", path, body: "", origin });

describe("parsePs", () => {
  test("reads a captured sample with api and db stopped", () => {
    assert.deepEqual(parsePs(STOPPED), {
      api: { state: "exited", health: null },
      db: { state: "exited", health: null },
      loadgen: { state: "running", health: null },
    });
  });

  test("reads a captured sample with everything running", () => {
    assert.deepEqual(parsePs(RUNNING), {
      api: { state: "running", health: "healthy" },
      db: { state: "running", health: "healthy" },
      loadgen: { state: "running", health: null },
    });
  });

  test("marks services compose does not list as absent", () => {
    const only = JSON.stringify({ Service: "db", State: "running", Health: "starting" });
    assert.deepEqual(parsePs(`${only}\n`), {
      api: { state: "absent", health: null },
      db: { state: "running", health: "starting" },
      loadgen: { state: "absent", health: null },
    });
    assert.equal(parsePs("").api.state, "absent");
  });

  test("accepts the JSON array form and unhealthy", () => {
    const rows = [{ Service: "api", State: "running", Health: "unhealthy" }];
    assert.deepEqual(parsePs(JSON.stringify(rows)).api, { state: "running", health: "unhealthy" });
  });

  test("throws on malformed output instead of guessing", () => {
    assert.throws(() => parsePs("not json"), SyntaxError);
    assert.throws(() => parsePs(JSON.stringify({ State: "running" })), /Service/);
  });
});

describe("handle: reads", () => {
  test("GET /health names the compose project", async () => {
    const res = await handle(get("/health"), fakeDeps());
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { operator: "ok", compose: "learning" });
  });

  test("GET /containers runs ps -a and returns the parsed services", async () => {
    const deps = fakeDeps({ psOut: STOPPED });
    const res = await handle(get("/containers"), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(deps.calls, [PS_ARGS]);
    assert.equal(res.body.services.api.state, "exited");
    assert.equal(res.body.services.loadgen.state, "running");
  });

  test("GET /containers answers 500 when ps fails", async () => {
    const deps = fakeDeps();
    deps.compose = async () => ({ code: 1, stdout: "", stderr: "socket gone" });
    const res = await handle(get("/containers"), deps);
    assert.equal(res.status, 500);
    assert.deepEqual(res.body.stderr, ["socket gone"]);
  });

  test("unknown path is 404, wrong method is 405", async () => {
    assert.equal((await handle(get("/nope"), fakeDeps())).status, 404);
    const del = await handle({ method: "DELETE", path: "/containers", body: "" }, fakeDeps());
    assert.equal(del.status, 405);
    assert.equal(del.headers.allow, "GET, OPTIONS");
  });
});

describe("handle: start and stop", () => {
  test("start dispatches up -d --wait with the services, then ps", async () => {
    const deps = fakeDeps();
    const res = await handle(post("/containers/start", { services: ["api", "db"] }), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(deps.calls, [["up", "-d", "--wait", "api", "db"], PS_ARGS]);
    assert.deepEqual(res.body.services.api, { state: "running", health: "healthy" });
  });

  test("stop dispatches stop (not down), duplicates collapsed", async () => {
    const deps = fakeDeps({ psOut: STOPPED });
    const res = await handle(post("/containers/stop", { services: ["db", "db"] }), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(deps.calls, [["stop", "db"], PS_ARGS]);
    assert.equal(res.body.services.db.state, "exited");
  });
});

describe("handle: body validation", () => {
  const badBodies = [
    ["loadgen is not controllable", JSON.stringify({ services: ["loadgen"] })],
    ["profile service", JSON.stringify({ services: ["api", "k6"] })],
    ["flag injection", JSON.stringify({ services: ["--remove-orphans"] })],
    ["empty list", JSON.stringify({ services: [] })],
    ["not a list", JSON.stringify({ services: "api" })],
    ["non-string entry", JSON.stringify({ services: [1] })],
    ["missing services", JSON.stringify({})],
    ["array body", JSON.stringify(["api"])],
    ["null body", "null"],
    ["invalid JSON", "{services:"],
    ["empty body", ""],
  ];
  for (const [name, body] of badBodies) {
    for (const path of ["/containers/start", "/containers/stop"]) {
      test(`${path} rejects ${name} with 400 and runs nothing`, async () => {
        const deps = fakeDeps();
        const res = await handle({ method: "POST", path, body }, deps);
        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, "string");
        assert.deepEqual(deps.calls, []);
      });
    }
  }
});

describe("handle: compose failures", () => {
  test("compose taking 120 s or more answers 504", async () => {
    const deps = fakeDeps({ result: { code: null, stdout: "", stderr: "" }, times: [1_000, 121_000] });
    const res = await handle(post("/containers/start", { services: ["api"] }), deps);
    assert.equal(res.status, 504);
    assert.deepEqual(deps.calls, [["up", "-d", "--wait", "api"]]);
  });

  test("compose finishing just under 120 s is not a timeout", async () => {
    const deps = fakeDeps({ times: [0, 119_999] });
    const res = await handle(post("/containers/start", { services: ["api"] }), deps);
    assert.equal(res.status, 200);
  });

  test("non-zero exit answers 500 with the last 20 stderr lines", async () => {
    const stderr = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
    const deps = fakeDeps({ result: { code: 1, stdout: "", stderr } });
    const res = await handle(post("/containers/stop", { services: ["api"] }), deps);
    assert.equal(res.status, 500);
    assert.equal(res.body.stderr.length, 20);
    assert.equal(res.body.stderr[0], "line 6");
    assert.equal(res.body.stderr[19], "line 25");
    assert.deepEqual(deps.calls, [["stop", "api"]]);
  });
});

describe("handle: CORS", () => {
  const allowed = ["http://localhost:3200", "http://127.0.0.1:3200", "http://localhost:5173"];
  for (const origin of allowed) {
    test(`echoes allowed origin ${origin}`, async () => {
      const res = await handle(get("/health", origin), fakeDeps());
      assert.equal(res.headers["access-control-allow-origin"], origin);
      assert.equal(res.headers.vary, "Origin");
    });
  }

  test("other origins get no CORS headers", async () => {
    for (const origin of ["http://evil.example", "http://localhost:3201", undefined]) {
      const res = await handle(get("/health", origin), fakeDeps());
      const cors = Object.keys(res.headers).filter((h) => h.startsWith("access-control"));
      assert.deepEqual(cors, []);
    }
  });

  test("preflight from an allowed origin allows POST with a JSON body", async () => {
    const res = await handle({ method: "OPTIONS", path: "/containers/start", body: "", origin: allowed[0] }, fakeDeps());
    assert.equal(res.status, 204);
    assert.equal(res.headers["access-control-allow-origin"], allowed[0]);
    assert.match(res.headers["access-control-allow-methods"], /POST/);
    assert.match(res.headers["access-control-allow-headers"], /content-type/);
  });

  test("preflight from another origin carries no CORS headers", async () => {
    const res = await handle({ method: "OPTIONS", path: "/containers/start", body: "", origin: "http://evil.example" }, fakeDeps());
    assert.equal(res.status, 204);
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });

  test("POST from another origin is refused before compose runs", async () => {
    const deps = fakeDeps();
    const res = await handle(post("/containers/stop", { services: ["api"] }, "http://evil.example"), deps);
    assert.equal(res.status, 403);
    assert.deepEqual(deps.calls, []);
  });
});

describe("live compose", { skip: process.env.LAB_LIVE !== "1" && "set LAB_LIVE=1 with the stack reachable" }, () => {
  const deps = { compose: makeCompose(120_000), now: Date.now, project: "learning" };
  const body = { services: ["api", "db"] };
  after(() => deps.compose(["up", "-d", "--wait", "api", "db"]));

  test("start brings api and db up healthy", { timeout: 130_000 }, async () => {
    const res = await handle(post("/containers/start", body), deps);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.services.api, { state: "running", health: "healthy" });
    assert.deepEqual(res.body.services.db, { state: "running", health: "healthy" });
  });

  test("stop leaves api and db exited and loadgen running", { timeout: 130_000 }, async () => {
    const res = await handle(post("/containers/stop", body), deps);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.services.api.state, "exited");
    assert.equal(res.body.services.db.state, "exited");
    assert.equal(res.body.services.loadgen.state, "running");
  });
});
