import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle, parsePs, parsePods, parseNodes, listOverlays, makeExec, withoutNamespace } from "./operator.mjs";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const RUNNING = fixture("ps-all-running.ndjson");
const STOPPED = fixture("ps-api-db-stopped.ndjson");
const PODS = fixture("pods-000-starting.json");
const NODES = fixture("nodes-3-ready.json");
const dc = (...args) => ["docker", "compose", ...args];
const PS_ARGS = dc("ps", "--format", "json", "-a");
const kc = (...args) => ["kubectl", "--context", "kind-lab", ...args];
const OVERLAYS = [{ name: "000-k8s", project: "000" }, { name: "010-sidecar", project: "010" }];
const NODES_CMD = kc("get", "nodes", "-o", "json", "--request-timeout=10s");
const podsCmd = (id) => kc("-n", "lab", "get", "pods", "-l", `lab/project=${id}`, "-o", "json", "--request-timeout=10s");
const renderCmd = (o) => kc("kustomize", "--load-restrictor", "LoadRestrictionsNone", `deploy/k8s/overlays/${o}`);
const EMPTY_PODS = JSON.stringify({ apiVersion: "v1", kind: "List", items: [] });
const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });

// Default answers: ps, nodes and pods from captured fixtures; anything else succeeds silently.
function defaultAnswer(line, { psOut, result }) {
  const text = line.join(" ");
  if (text === PS_ARGS.join(" ")) return ok(psOut);
  if (text === NODES_CMD.join(" ")) return ok(NODES);
  if (text === podsCmd("000").join(" ")) return ok(PODS);
  if (text === podsCmd("010").join(" ")) return ok(EMPTY_PODS);
  return result;
}

// Fake exec: records [cmd, ...args] and stdin; `answer` may override per command.
function fakeDeps({ result = ok(), psOut = RUNNING, times = [0, 0], answer = () => undefined } = {}) {
  const calls = [];
  const inputs = [];
  const clock = [...times];
  return {
    calls,
    inputs,
    project: "learning",
    overlays: () => OVERLAYS,
    now: () => (clock.length > 1 ? clock.shift() : clock[0]),
    timeouts: [],
    exec: async function (cmd, args, timeoutMs, input) {
      const line = [cmd, ...args];
      calls.push(line);
      inputs.push(input);
      this.timeouts.push(timeoutMs);
      return answer(line) ?? defaultAnswer(line, { psOut, result });
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
    deps.exec = async () => ({ code: 1, stdout: "", stderr: "socket gone" });
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
    assert.deepEqual(deps.calls, [dc("up", "-d", "--wait", "api", "db"), PS_ARGS]);
    assert.deepEqual(res.body.services.api, { state: "running", health: "healthy" });
  });

  test("stop dispatches stop (not down), duplicates collapsed", async () => {
    const deps = fakeDeps({ psOut: STOPPED });
    const res = await handle(post("/containers/stop", { services: ["db", "db"] }), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(deps.calls, [dc("stop", "db"), PS_ARGS]);
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
    assert.deepEqual(deps.calls, [dc("up", "-d", "--wait", "api")]);
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
    assert.deepEqual(deps.calls, [dc("stop", "api")]);
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

const API_POD = {
  name: "api-57744fcd4f-b7zs9",
  node: "lab-worker",
  containers: [{ name: "api", state: "running", ready: false, restarts: 0 }],
};
const DB_POD = {
  name: "db-5cf9fbcbcc-59bvv",
  node: "lab-worker2",
  containers: [{ name: "db", state: "running", ready: false, restarts: 0 }],
};
const STATUS_CALLS = [NODES_CMD, podsCmd("000"), podsCmd("010")];
const CLUSTER_UP = {
  exists: true,
  ready: "3/3",
  overlays: { "000-k8s": { applied: true, pods: [API_POD, DB_POD] }, "010-sidecar": { applied: false, pods: [] } },
};

describe("parseNodes and parsePods", () => {
  test("counts Ready nodes in a captured kind node list", () => {
    assert.deepEqual(parseNodes(NODES), { total: 3, ready: 3 });
    const node = (status) => ({ status: { conditions: [{ type: "MemoryPressure", status: "False" }, { type: "Ready", status }] } });
    const list = { items: [node("True"), node("False"), node("Unknown"), { status: {} }] };
    assert.deepEqual(parseNodes(JSON.stringify(list)), { total: 4, ready: 1 });
  });

  test("reads a captured pod list: name, node and each container", () => {
    assert.deepEqual(parsePods(PODS), [API_POD, DB_POD]);
  });

  test("maps waiting, terminated, restarts, and an unscheduled pod", () => {
    const pod = (name, spec, status) => ({ metadata: { name }, spec, status });
    const items = [
      pod("a", { nodeName: "w1", containers: [{ name: "api" }, { name: "stats" }] }, {
        containerStatuses: [
          { name: "api", ready: false, restartCount: 4, state: { waiting: { reason: "CrashLoopBackOff" } } },
          { name: "stats", ready: true, restartCount: 0, state: { terminated: { exitCode: 0 } } },
        ],
      }),
      pod("b", { containers: [{ name: "api" }] }, { phase: "Pending" }),
    ];
    assert.deepEqual(parsePods(JSON.stringify({ items })), [
      { name: "a", node: "w1", containers: [
        { name: "api", state: "waiting", ready: false, restarts: 4 },
        { name: "stats", state: "terminated", ready: true, restarts: 0 },
      ] },
      { name: "b", node: null, containers: [{ name: "api", state: "waiting", ready: false, restarts: 0 }] },
    ]);
  });

  test("throws on output that is not a kubectl list", () => {
    assert.throws(() => parsePods("nope"), SyntaxError);
    assert.throws(() => parsePods("{}"), /items/);
    assert.throws(() => parseNodes(JSON.stringify({ kind: "Status" })), /items/);
    const noState = { items: [{ metadata: { name: "a" }, spec: {}, status: { containerStatuses: [{ name: "x", ready: true, restartCount: 0, state: {} }] } }] };
    assert.throws(() => parsePods(JSON.stringify(noState)), /container x of pod a has no state/);
  });
});

describe("listOverlays", () => {
  const dir = mkdtempSync(join(tmpdir(), "overlays-"));
  after(() => rmSync(dir, { recursive: true }));
  const overlay = (name, text) => {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, "kustomization.yaml"), text);
  };

  test("lists each overlay directory with its lab/project label; skips bad names and files", () => {
    overlay("000-k8s", 'labels:\n  - pairs:\n      lab/project: "000"\n');
    overlay("020-hpa", "labels:\n  - pairs:\n      lab/project: 020\n");
    overlay("Bad_Name", 'lab/project: "999"\n');
    writeFileSync(join(dir, "notes.txt"), "not an overlay");
    assert.deepEqual(listOverlays(dir), [{ name: "000-k8s", project: "000" }, { name: "020-hpa", project: "020" }]);
  });

  test("an overlay without a lab/project label fails loudly", () => {
    overlay("030-bare", "resources:\n  - ../../base\n");
    assert.throws(() => listOverlays(dir), /030-bare has no lab\/project label/);
  });
});

describe("handle: cluster", () => {
  test("GET /cluster reads nodes, then each overlay's pods by its project label", async () => {
    const deps = fakeDeps();
    const res = await handle(get("/cluster"), deps);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, CLUSTER_UP);
    assert.deepEqual(deps.calls, STATUS_CALLS);
  });

  test("GET /cluster without a reachable cluster says so and queries no pods", async () => {
    const deps = fakeDeps({ answer: (line) => (line.includes("nodes") ? { code: 1, stdout: "", stderr: 'error: context "kind-lab" does not exist\n' } : undefined) });
    const res = await handle(get("/cluster"), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      exists: false,
      ready: "0/0",
      reason: 'error: context "kind-lab" does not exist',
      overlays: { "000-k8s": { applied: false, pods: [] }, "010-sidecar": { applied: false, pods: [] } },
    });
    assert.deepEqual(deps.calls, [NODES_CMD]);
  });

  test("GET /cluster answers 500 when a pod query fails", async () => {
    const deps = fakeDeps({ answer: (line) => (line.includes("pods") ? { code: 1, stdout: "", stderr: "forbidden" } : undefined) });
    const res = await handle(get("/cluster"), deps);
    assert.equal(res.status, 500);
    assert.deepEqual(res.body.stderr, ["forbidden"]);
  });

});

describe("handle: cluster up and down", () => {
  test("POST /cluster/up runs cluster.sh up then images.sh all, 600 s each, then reports", async () => {
    const deps = fakeDeps();
    const res = await handle(post("/cluster/up", {}), deps);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(deps.calls, [["bash", "lab/cluster.sh", "up"], ["bash", "lab/images.sh", "all"], ...STATUS_CALLS]);
    assert.deepEqual(deps.timeouts.slice(0, 2), [600_000, 600_000]);
    assert.deepEqual(res.body, CLUSTER_UP);
  });

  test("POST /cluster/up stops at a failed cluster.sh and loads no images", async () => {
    const deps = fakeDeps({ answer: (line) => (line[1] === "lab/cluster.sh" ? { code: 1, stdout: "", stderr: "kind failed\n" } : undefined) });
    const res = await handle(post("/cluster/up", {}), deps);
    assert.equal(res.status, 500);
    assert.equal(res.body.error, "bash lab/cluster.sh up exited 1");
    assert.deepEqual(deps.calls, [["bash", "lab/cluster.sh", "up"]]);
  });

  test("POST /cluster/up taking 600 s or more answers 504", async () => {
    const deps = fakeDeps({ times: [0, 600_000] });
    const res = await handle(post("/cluster/up", {}), deps);
    assert.equal(res.status, 504);
    assert.equal(res.body.error, "bash lab/cluster.sh up exceeded 600 s");
  });

  test("POST /cluster/down runs cluster.sh down, then reports", async () => {
    const deps = fakeDeps();
    const res = await handle(post("/cluster/down", {}), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(deps.calls, [["bash", "lab/cluster.sh", "down"], ...STATUS_CALLS]);
  });

});

const NS = "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: lab\n";
const SVC = "apiVersion: v1\nkind: Service\nmetadata:\n  name: api\n  namespace: lab\n";
// A RoleBinding naming a Namespace kind below the top level is kept.
const RB = "apiVersion: v1\nkind: RoleBinding\nsubjects:\n  - kind: Namespace\n";
const RENDER = `${NS}---\n${SVC}---\n${RB}`;

describe("withoutNamespace", () => {
  test("drops exactly the Namespace document and keeps the rest in order", () => {
    assert.equal(withoutNamespace(RENDER), `${SVC}---\n${RB}`);
    assert.equal(withoutNamespace(`${SVC}---\n${NS}---\n${RB}`), `${SVC}---\n${RB}`);
  });

  test("handles a leading document separator", () => {
    assert.equal(withoutNamespace(`---\n${NS}---\n${SVC}`), SVC);
  });

  test("leaves a render without a Namespace unchanged", () => {
    assert.equal(withoutNamespace(`${SVC}---\n${RB}`), `${SVC}---\n${RB}`);
  });
});

describe("handle: cluster overlays", () => {
  test("POST /cluster/apply renders, applies the render on stdin, waits on each deployment it named", async () => {
    const applied = "namespace/lab\nservice/api\ndeployment.apps/api\ndeployment.apps/db\n";
    const deps = fakeDeps({ answer: (line) => (line[3] === "kustomize" ? ok(RENDER) : line[3] === "apply" ? ok(applied) : undefined) });
    const res = await handle(post("/cluster/apply", { overlay: "000-k8s" }), deps);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(deps.calls, [
      renderCmd("000-k8s"),
      kc("apply", "-f", "-", "-o", "name"),
      kc("-n", "lab", "rollout", "status", "deploy/api", "--timeout=180s"),
      kc("-n", "lab", "rollout", "status", "deploy/db", "--timeout=180s"),
      ...STATUS_CALLS,
    ]);
    assert.deepEqual(deps.inputs.slice(0, 3), [undefined, RENDER, undefined]);
    assert.deepEqual(res.body, CLUSTER_UP);
  });

  test("POST /cluster/apply stops when apply fails: no rollout wait", async () => {
    const deps = fakeDeps({ answer: (line) => (line[3] === "apply" ? { code: 1, stdout: "", stderr: "invalid\n" } : undefined) });
    const res = await handle(post("/cluster/apply", { overlay: "010-sidecar" }), deps);
    assert.equal(res.status, 500);
    assert.deepEqual(deps.calls, [renderCmd("010-sidecar"), kc("apply", "-f", "-", "-o", "name")]);
  });

  test("POST /cluster/delete deletes the render but the lab namespace, ignoring what is already gone", async () => {
    const deps = fakeDeps({ answer: (line) => (line[3] === "kustomize" ? ok(RENDER) : undefined) });
    const res = await handle(post("/cluster/delete", { overlay: "010-sidecar" }), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(deps.calls, [renderCmd("010-sidecar"), kc("delete", "-f", "-", "--ignore-not-found"), ...STATUS_CALLS]);
    assert.equal(deps.inputs[1], `${SVC}---\n${RB}`);
  });

});

describe("handle: cluster overlay validation", () => {
  const badOverlays = [
    ["unknown overlay", JSON.stringify({ overlay: "999-nope" })],
    ["path traversal", JSON.stringify({ overlay: "../base" })],
    ["flag injection", JSON.stringify({ overlay: "--all" })],
    ["upper case", JSON.stringify({ overlay: "000-K8S" })],
    ["empty name", JSON.stringify({ overlay: "" })],
    ["number", JSON.stringify({ overlay: 0 })],
    ["missing overlay", JSON.stringify({})],
    ["null body", "null"],
    ["invalid JSON", "{overlay:"],
  ];
  for (const [name, body] of badOverlays) {
    for (const path of ["/cluster/apply", "/cluster/delete"]) {
      test(`${path} rejects ${name} with 400 and runs nothing`, async () => {
        const deps = fakeDeps();
        const res = await handle({ method: "POST", path, body }, deps);
        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, "string");
        assert.deepEqual(deps.calls, []);
      });
    }
  }

  test("cluster POSTs from another origin are refused before anything runs", async () => {
    for (const path of ["/cluster/up", "/cluster/down", "/cluster/apply", "/cluster/delete"]) {
      const deps = fakeDeps();
      const res = await handle(post(path, { overlay: "000-k8s" }, "http://evil.example"), deps);
      assert.equal(res.status, 403);
      assert.deepEqual(deps.calls, []);
    }
  });
});

describe("live cluster", { skip: process.env.LAB_LIVE !== "1" && "set LAB_LIVE=1 with the kind cluster up" }, () => {
  test("GET /cluster shows 3 ready nodes", { timeout: 30_000 }, async () => {
    const deps = { exec: makeExec(), now: Date.now, project: "learning", overlays: () => listOverlays() };
    const res = await handle(get("/cluster"), deps);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual([res.body.exists, res.body.ready], [true, "3/3"]);
  });
});

describe("live compose", { skip: process.env.LAB_LIVE !== "1" && "set LAB_LIVE=1 with the stack reachable" }, () => {
  const deps = { exec: makeExec(), now: Date.now, project: "learning" };
  const body = { services: ["api", "db"] };
  after(() => deps.exec("docker", ["compose", "up", "-d", "--wait", "api", "db"], 120_000));

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
