// Host-side lab operator: lets the browser UI start and stop compose services.
import http from "node:http";
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

// Runs compose; returns an error reply on timeout or failure, else the result.
async function runCompose(deps, args) {
  const started = deps.now();
  const result = await deps.compose(args);
  if (deps.now() - started >= COMPOSE_TIMEOUT_MS) return { error: reply(504, { error: `compose ${args[0]} exceeded 120 s` }) };
  if (result.code !== 0) {
    return { error: reply(500, { error: `compose ${args[0]} exited ${result.code}`, stderr: tail(result.stderr, 20) }) };
  }
  return { result };
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

const ROUTES = {
  "/health": { GET: (req, deps) => reply(200, { operator: "ok", compose: deps.project }) },
  "/containers": { GET: (req, deps) => listContainers(deps) },
  "/containers/start": { POST: (req, deps) => changeServices(req, deps, (s) => ["up", "-d", "--wait", ...s]) },
  "/containers/stop": { POST: (req, deps) => changeServices(req, deps, (s) => ["stop", ...s]) },
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

// Runs `docker compose <args>` in the repo root; timeoutMs 0 means no limit.
export function makeCompose(timeoutMs) {
  const env = { ...process.env, DOCKER_HOST: dockerHost() };
  return (args) =>
    new Promise((resolve, reject) => {
      const child = spawn("docker", ["compose", ...args], { cwd: ROOT, env, timeout: timeoutMs });
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

async function composeOrThrow(compose, args) {
  const result = await compose(args);
  if (result.code !== 0) throw new Error(`docker compose ${args.join(" ")} exited ${result.code}\n${result.stderr}`);
  return result.stdout;
}

async function main(argv) {
  const opts = options(argv);
  const unlimited = makeCompose(0);
  // First start may build images, so no 120 s limit here.
  if (opts.loadgen) await composeOrThrow(unlimited, ["up", "-d", "--wait", "loadgen"]);
  const project = JSON.parse(await composeOrThrow(unlimited, ["config", "--format", "json"])).name;
  const deps = { compose: makeCompose(COMPOSE_TIMEOUT_MS), now: Date.now, project };
  const server = http.createServer((req, res) => respond(req, res, deps));
  server.listen(opts.port, "127.0.0.1", () => {
    console.log("Load lab: http://localhost:3200");
    console.log(`Operator: http://127.0.0.1:${opts.port} (compose project ${project})`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
