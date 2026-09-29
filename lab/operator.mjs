// Host-side lab operator: the browser UI starts and stops compose services and the kind cluster.
import http from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { userInfo } from "node:os";
import { parseArgs } from "node:util";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LISTED = ["api", "db", "loadgen"];
const CONTROLLABLE = new Set(["api", "db"]);
const ALLOWED_ORIGINS = new Set(["http://localhost:3200", "http://127.0.0.1:3200", "http://localhost:5173"]);
const PS_ARGS = ["ps", "--format", "json", "-a"];
const COMPOSE_TIMEOUT_MS = 120_000;
const OVERLAYS_DIR = join(ROOT, "deploy/k8s/overlays");
const NAME = /^[a-z0-9-]+$/;
// The user's default context may be a real cluster: always name kind's.
const KUBECTL = ["--context", "kind-lab"];
const GET_TIMEOUT_MS = 15_000;
const APPLY_TIMEOUT_MS = 60_000;
const ROLLOUT_TIMEOUT_MS = 190_000;
const DELETE_TIMEOUT_MS = 180_000;
const CLUSTER_UP_TIMEOUT_MS = 600_000;
const CLUSTER_DOWN_TIMEOUT_MS = 180_000;
const MAX_BODY_BYTES = 4096;

const reply = (status, body, headers = {}) => ({ status, body, headers });

// Compose prints one JSON object per line; older versions print one array.
function psRows(stdout) {
  const text = stdout.trim();
  if (text === "") return [];
  if (text.startsWith("[")) return JSON.parse(text);
  return text.split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line));
}

function serviceStatus(row) {
  if (row === undefined) return { state: "absent", health: null };
  return { state: row.State, health: row.Health === "" ? null : row.Health };
}

export function parsePs(stdout) {
  const rows = psRows(stdout);
  const unnamed = rows.find((row) => typeof row.Service !== "string");
  if (unnamed) throw new Error(`compose ps row without Service: ${JSON.stringify(unnamed)}`);
  return Object.fromEntries(LISTED.map((name) => [name, serviceStatus(rows.find((row) => row.Service === name))]));
}

// Returns {services} or {error}; only allow-listed names ever reach a command.
function parseServices(body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { error: "body must be JSON like {\"services\": [\"api\"]}" };
  }
  const services = parsed?.services;
  if (!Array.isArray(services) || services.length === 0) return { error: "services must be a non-empty array" };
  const bad = services.find((name) => !CONTROLLABLE.has(name));
  if (bad !== undefined) return { error: `service ${JSON.stringify(bad)} is not one of ${[...CONTROLLABLE].join(", ")}` };
  return { services: [...new Set(services)] };
}

const tail = (text, lines) => text.split("\n").filter((line) => line !== "").slice(-lines);

// Runs one command; returns an error reply on timeout or failure, else the result.
async function runStep(deps, cmd, args, timeoutMs, input) {
  const line = [cmd, ...args].join(" ");
  const started = deps.now();
  const result = await deps.exec(cmd, args, timeoutMs, input);
  if (deps.now() - started >= timeoutMs) return { error: reply(504, { error: `${line} exceeded ${timeoutMs / 1000} s` }) };
  if (result.code !== 0) return { error: reply(500, { error: `${line} exited ${result.code}`, stderr: tail(result.stderr, 20) }) };
  return { result };
}

const runCompose = (deps, args) => runStep(deps, "docker", ["compose", ...args], COMPOSE_TIMEOUT_MS);
const kubectl = (deps, args, timeoutMs, input) => runStep(deps, "kubectl", [...KUBECTL, ...args], timeoutMs, input);

// Runs steps in order, stopping at the first error reply.
async function runSteps(steps) {
  for (const step of steps) {
    const out = await step();
    if (out.error) return out;
  }
  return {};
}

async function listContainers(deps) {
  const ps = await runCompose(deps, PS_ARGS);
  return ps.error ?? reply(200, { services: parsePs(ps.result.stdout) });
}

async function changeServices(req, deps, argsFor) {
  const parsed = parseServices(req.body);
  if (parsed.error) return reply(400, { error: parsed.error });
  const run = await runCompose(deps, argsFor(parsed.services));
  return run.error ?? listContainers(deps);
}

function listItems(stdout) {
  const list = JSON.parse(stdout);
  if (!Array.isArray(list?.items)) throw new Error(`kubectl output has no items array: ${stdout.slice(0, 200)}`);
  return list.items;
}

const isReady = (node) => (node.status?.conditions ?? []).some((c) => c.type === "Ready" && c.status === "True");

export function parseNodes(stdout) {
  const items = listItems(stdout);
  return { total: items.length, ready: items.filter(isReady).length };
}

const STATES = ["running", "waiting", "terminated"];

function containerStatus(pod, status) {
  const state = STATES.find((key) => status.state?.[key] !== undefined);
  if (state === undefined) throw new Error(`container ${status.name} of pod ${pod.metadata.name} has no state`);
  return { name: status.name, state, ready: status.ready, restarts: status.restartCount };
}

// A pod not yet scheduled has no statuses: its containers are waiting.
function podContainers(pod) {
  const statuses = pod.status?.containerStatuses;
  if (statuses === undefined) return pod.spec.containers.map(({ name }) => ({ name, state: "waiting", ready: false, restarts: 0 }));
  return statuses.map((status) => containerStatus(pod, status));
}

export function parsePods(stdout) {
  return listItems(stdout).map((pod) => ({ name: pod.metadata.name, node: pod.spec.nodeName ?? null, containers: podContainers(pod) }));
}

// Overlay directories and the lab/project label each one stamps on its pods.
export function listOverlays(dir = OVERLAYS_DIR) {
  const names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && NAME.test(e.name)).map((e) => e.name);
  return names.toSorted().map((name) => {
    const text = readFileSync(join(dir, name, "kustomization.yaml"), "utf8");
    const project = /lab\/project:\s*"?([a-z0-9-]+)"?\s*$/m.exec(text)?.[1];
    if (project === undefined) throw new Error(`overlay ${name} has no lab/project label`);
    return { name, project };
  });
}

const NO_PODS = Object.freeze({ applied: false, pods: [] });

async function overlayPods(deps, { project }) {
  const args = ["-n", "lab", "get", "pods", "-l", `lab/project=${project}`, "-o", "json", "--request-timeout=10s"];
  const run = await kubectl(deps, args, GET_TIMEOUT_MS);
  if (run.error) return run;
  const pods = parsePods(run.result.stdout);
  return { overlay: { applied: pods.length > 0, pods } };
}

// Any kubectl failure on nodes means no reachable kind cluster.
async function clusterStatus(deps) {
  const overlays = deps.overlays();
  const nodes = await deps.exec("kubectl", [...KUBECTL, "get", "nodes", "-o", "json", "--request-timeout=10s"], GET_TIMEOUT_MS);
  if (nodes.code !== 0) {
    const absent = Object.fromEntries(overlays.map((o) => [o.name, NO_PODS]));
    return reply(200, { exists: false, ready: "0/0", reason: tail(nodes.stderr, 1).join(""), overlays: absent });
  }
  const { total, ready } = parseNodes(nodes.stdout);
  const found = [];
  for (const overlay of overlays) {
    const out = await overlayPods(deps, overlay);
    if (out.error) return out.error;
    found.push([overlay.name, out.overlay]);
  }
  return reply(200, { exists: true, ready: `${ready}/${total}`, overlays: Object.fromEntries(found) });
}

// Returns {overlay} or {error}; only listed directory names ever reach a command.
function parseOverlay(body, deps) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { error: "body must be JSON like {\"overlay\": \"000-k8s\"}" };
  }
  const overlay = parsed?.overlay;
  if (typeof overlay !== "string" || !NAME.test(overlay)) return { error: `overlay must match ${NAME.source}` };
  const known = deps.overlays().map((o) => o.name);
  if (!known.includes(overlay)) return { error: `overlay ${JSON.stringify(overlay)} is not one of ${known.join(", ")}` };
  return { overlay };
}

// The base reads ../../../db/init.sql, so kustomize needs the load restrictor off.
const render = (deps, overlay) =>
  kubectl(deps, ["kustomize", "--load-restrictor", "LoadRestrictionsNone", `deploy/k8s/overlays/${overlay}`], APPLY_TIMEOUT_MS);

const deploymentsIn = (applyOut) => [...applyOut.matchAll(/^deployment\.apps\/([a-z0-9.-]+)$/gm)].map((m) => m[1]);

async function applyOverlay(deps, overlay) {
  const rendered = await render(deps, overlay);
  if (rendered.error) return rendered;
  const applied = await kubectl(deps, ["apply", "-f", "-", "-o", "name"], APPLY_TIMEOUT_MS, rendered.result.stdout);
  if (applied.error) return applied;
  const waits = deploymentsIn(applied.result.stdout).map((name) => () =>
    kubectl(deps, ["-n", "lab", "rollout", "status", `deploy/${name}`, "--timeout=180s"], ROLLOUT_TIMEOUT_MS));
  return runSteps(waits);
}

// Every overlay shares the lab namespace, so one overlay's delete must keep it.
export const withoutNamespace = (yaml) =>
  yaml.split(/^---[ \t]*\n/m).filter((doc) => doc.trim() !== "" && !/^kind:\s*Namespace\s*$/m.test(doc)).join("---\n");

async function deleteOverlay(deps, overlay) {
  const rendered = await render(deps, overlay);
  if (rendered.error) return rendered;
  return kubectl(deps, ["delete", "-f", "-", "--ignore-not-found"], DELETE_TIMEOUT_MS, withoutNamespace(rendered.result.stdout));
}

async function changeOverlay(req, deps, action) {
  const parsed = parseOverlay(req.body, deps);
  if (parsed.error) return reply(400, { error: parsed.error });
  const out = await action(deps, parsed.overlay);
  return out.error ?? clusterStatus(deps);
}

// ponytail: synchronous up to 600 s per step; a job id if clients time out.
async function clusterUp(deps) {
  const out = await runSteps([
    () => runStep(deps, "bash", ["lab/cluster.sh", "up"], CLUSTER_UP_TIMEOUT_MS),
    () => runStep(deps, "bash", ["lab/images.sh", "all"], CLUSTER_UP_TIMEOUT_MS),
  ]);
  return out.error ?? clusterStatus(deps);
}

async function clusterDown(deps) {
  const out = await runStep(deps, "bash", ["lab/cluster.sh", "down"], CLUSTER_DOWN_TIMEOUT_MS);
  return out.error ?? clusterStatus(deps);
}

const ROUTES = {
  "/health": { GET: (req, deps) => reply(200, { operator: "ok", compose: deps.project }) },
  "/containers": { GET: (req, deps) => listContainers(deps) },
  "/containers/start": { POST: (req, deps) => changeServices(req, deps, (s) => ["up", "-d", "--wait", ...s]) },
  "/containers/stop": { POST: (req, deps) => changeServices(req, deps, (s) => ["stop", ...s]) },
  "/cluster": { GET: (req, deps) => clusterStatus(deps) },
  "/cluster/up": { POST: (req, deps) => clusterUp(deps) },
  "/cluster/down": { POST: (req, deps) => clusterDown(deps) },
  "/cluster/apply": { POST: (req, deps) => changeOverlay(req, deps, applyOverlay) },
  "/cluster/delete": { POST: (req, deps) => changeOverlay(req, deps, deleteOverlay) },
};

function corsHeaders(origin) {
  if (!ALLOWED_ORIGINS.has(origin)) return {};
  return { "access-control-allow-origin": origin, vary: "Origin" };
}

function route(req, deps) {
  const methods = ROUTES[req.path];
  if (methods === undefined) return reply(404, { error: `no route ${req.path}` });
  const allow = [...Object.keys(methods), "OPTIONS"].join(", ");
  if (req.method === "OPTIONS") return preflight(req.origin, allow);
  const action = methods[req.method];
  if (action === undefined) return reply(405, { error: `${req.method} not allowed` }, { allow });
  // A browser on another origin must not trigger start or stop.
  if (req.method === "POST" && req.origin !== undefined && !ALLOWED_ORIGINS.has(req.origin)) {
    return reply(403, { error: `origin ${req.origin} not allowed` });
  }
  return action(req, deps);
}

function preflight(origin, allow) {
  if (!ALLOWED_ORIGINS.has(origin)) return reply(204, null);
  return reply(204, null, {
    "access-control-allow-methods": allow,
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
  });
}

// Pure request handling: {method, path, body, origin} in, {status, headers, body} out.
export async function handle(req, deps) {
  const res = await route(req, deps);
  return { ...res, headers: { "content-type": "application/json", ...res.headers, ...corsHeaders(req.origin) } };
}

function dockerHost() {
  const runtimeDir = process.env.XDG_RUNTIME_DIR;
  const dir = runtimeDir === undefined || runtimeDir === "" ? `/run/user/${userInfo().uid}` : runtimeDir;
  return `unix://${dir}/podman/podman.sock`;
}

// Runs `cmd args` in the repo root, `input` on stdin; timeoutMs 0 means no limit.
export function makeExec() {
  const env = { ...process.env, DOCKER_HOST: dockerHost() };
  return (cmd, args, timeoutMs, input) =>
    new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd: ROOT, env, timeout: timeoutMs });
      // A child that exits before reading stdin reports through its exit code.
      child.stdin.on("error", (err) => { if (err.code !== "EPIPE") reject(err); });
      child.stdin.end(input);
      const out = { stdout: "", stderr: "" };
      child.stdout.on("data", (chunk) => (out.stdout += chunk));
      child.stderr.on("data", (chunk) => (out.stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, ...out }));
    });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) req.destroy(new Error("body too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function respond(req, res, deps) {
  try {
    const body = await readBody(req);
    const path = new URL(req.url, "http://127.0.0.1").pathname;
    const out = await handle({ method: req.method, path, body, origin: req.headers.origin }, deps);
    res.writeHead(out.status, out.headers).end(out.body === null ? undefined : JSON.stringify(out.body));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "operator error" }));
  }
}

function options(argv) {
  const { values } = parseArgs({ args: argv, options: { port: { type: "string", default: "3300" }, "no-loadgen": { type: "boolean", default: false } } });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`--port must be 1..65535, got ${values.port}`);
  return { port, loadgen: !values["no-loadgen"] };
}

async function composeOrThrow(exec, args) {
  const result = await exec("docker", ["compose", ...args], 0);
  if (result.code !== 0) throw new Error(`docker compose ${args.join(" ")} exited ${result.code}\n${result.stderr}`);
  return result.stdout;
}

async function main(argv) {
  const opts = options(argv);
  const exec = makeExec();
  // First start may build images, so no 120 s limit here.
  if (opts.loadgen) await composeOrThrow(exec, ["up", "-d", "--wait", "loadgen"]);
  const project = JSON.parse(await composeOrThrow(exec, ["config", "--format", "json"])).name;
  const deps = { exec, now: Date.now, project, overlays: () => listOverlays() };
  const server = http.createServer((req, res) => respond(req, res, deps));
  server.listen(opts.port, "127.0.0.1", () => {
    console.log("Load lab: http://localhost:3200");
    console.log(`Operator: http://127.0.0.1:${opts.port} (compose project ${project})`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
