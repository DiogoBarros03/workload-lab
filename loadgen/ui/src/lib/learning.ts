import { PROJECTS, type Project } from "./projects";

export type ProjectId = Project["id"];
export type ArchKind = "load" | "service" | "store" | "infra";
export type ArchNode = { id: string; label: string; sub?: string; kind: ArchKind; group?: string };
export type ArchEdge = { from: string; to: string; label?: string };
export type Architecture = { summary: string; nodes: ArchNode[]; edges: ArchEdge[] };
// null lists mean the project is not built, so nothing is measured yet.
export type Learning = { learned: string[] | null; architecture: Architecture; flaws: string[] | null };

const node = (id: string, label: string, kind: ArchKind, extra: Partial<ArchNode> = {}): ArchNode => ({ id, label, kind, ...extra });
const chain = (...ids: string[]): ArchEdge[] => ids.slice(1).map((to, i) => ({ from: ids[i], to }));
// Every member of a group, numbered, drawn side by side.
const many = (prefix: string, label: string, kind: ArchKind, group: string, count: number): ArchNode[] =>
  Array.from({ length: count }, (_, i) => node(`${prefix}-${i + 1}`, label, kind, { group }));
const fan = (from: string, to: ArchNode[]): ArchEdge[] => to.map((n) => ({ from, to: n.id }));
const join = (from: ArchNode[], to: string): ArchEdge[] => from.map((n) => ({ from: n.id, to }));

const LOADGEN = node("loadgen", "loadgen", "load");
const DB = node("db", "db", "store", { sub: "Postgres 16" });

const BASELINE: Learning = {
  learned: [
    "Reads are bound by the API's CPU quota. At 3 000 RPS the container uses 0.26 of 0.5 cores with p99 15 ms; at 5 000 it is throttled 166 times in 20 s, memory reaches 128 MiB, and a third of the requests are dropped or fail.",
    "Writes are bound by the connection pool. Ten connections at about 12 ms per insert give a ceiling near 800 RPS; at 1 000 RPS the pool is full with 3 865 requests waiting while CPU sits at 0.37 cores.",
    "Past the knee the system fails by queueing, not by erroring. Latency climbs to seconds, in-flight climbs to the 10 000 cap, memory fills, and the kernel kills the process (exit 137).",
    "Little's law holds: in-flight equals RPS times latency. At 1 000 RPS with p50 1.8 s the run peaked at 4 087 requests in flight.",
    "Health checks that share the traffic pool lie under load. Moving them to a dedicated connection made a saturated API report as up in under a millisecond instead of timing out.",
    "A process that dies when its database disappears needs something to restart it. The restart policy stands in for a scheduler until Kubernetes does it.",
  ],
  architecture: {
    summary: "One synchronous request path. Each request holds a pooled connection for the duration of its query; nothing queues, retries, or sheds load.",
    nodes: [
      node("loadgen", "loadgen", "load", { sub: "no limits" }),
      node("api", "api", "service", { sub: "Fastify · 0.5 CPU · 128 MiB · pool 10" }),
      node("db", "db", "store", { sub: "Postgres 16 · 1 CPU · 256 MiB" }),
    ],
    edges: [{ from: "loadgen", to: "api", label: "HTTP, fixed rate" }, { from: "api", to: "db", label: "SQL, 10 connections" }],
  },
  flaws: [
    "Single instance. One process and one CPU quota; there is no way to add capacity except a bigger box.",
    "No backpressure. The API accepts every connection until memory runs out; nothing sheds load or answers 503 early.",
    "No server-side timeouts. A request waits for a pool connection for as long as the client will wait.",
    "Pool size is a guess. Ten connections is the write ceiling, and nothing measures whether the database could take more.",
    "No retries, no circuit breaker. A database blip becomes a burst of 503s for every caller.",
    "Health conflates the app with its dependency. A database outage makes the API report unhealthy even though the process is fine.",
    "Single points of failure. One API, one database, no replicas, no failover.",
  ],
};

const REPLICAS = many("api", "api", "service", "Replicas", 3);
const SHARDS = [node("db-a", "db-a", "store", { group: "Shards" }), node("db-b", "db-b", "store", { group: "Shards" })];
const LEAVES = many("leaf", "leaf", "service", "Leaves", 3);
const FUNCTIONS = many("fn", "function", "service", "Functions", 3);
const WORKERS_2 = many("worker", "worker", "service", "Workers", 2);
const WORKERS_3 = many("worker", "worker", "service", "Workers", 3);
const POD = [node("api", "api", "service", { group: "Pod" }), node("sidecar", "metrics sidecar", "infra", { group: "Pod" })];

// Planned diagrams for projects not built yet.
const PLANNED: Record<string, Omit<Architecture, "summary">> = {
  "001": { nodes: [...POD, DB], edges: chain("api", "db") },
  "002": {
    nodes: [node("api", "api", "service"), node("ambassador", "ambassador", "infra", { sub: "retries · timeouts · breaker" }), DB],
    edges: chain("api", "ambassador", "db"),
  },
  "003": { nodes: [node("api", "api", "service"), node("adapter", "adapter", "infra"), node("monitoring", "monitoring", "infra")], edges: chain("api", "adapter", "monitoring") },
  "004": { nodes: [LOADGEN, node("lb", "load balancer", "infra"), ...REPLICAS, DB], edges: [...chain("loadgen", "lb"), ...fan("lb", REPLICAS), ...join(REPLICAS, "db")] },
  "005": { nodes: [LOADGEN, node("router", "shard router", "infra"), ...SHARDS], edges: [...chain("loadgen", "router"), ...fan("router", SHARDS)] },
  "006": { nodes: [LOADGEN, node("root", "root", "service"), ...LEAVES], edges: [...chain("loadgen", "root"), ...fan("root", LEAVES)] },
  "007": { nodes: [LOADGEN, node("gateway", "gateway", "infra"), ...FUNCTIONS, DB], edges: [...chain("loadgen", "gateway"), ...fan("gateway", FUNCTIONS), ...join(FUNCTIONS, "db")] },
  "008": { nodes: [...REPLICAS, node("lock", "lock", "store"), DB], edges: [...join(REPLICAS, "lock"), ...chain("lock", "db")] },
  "009": { nodes: [node("api", "api", "service"), node("queue", "queue", "infra"), ...WORKERS_2, DB], edges: [...chain("api", "queue"), ...fan("queue", WORKERS_2), ...join(WORKERS_2, "db")] },
  "010": {
    nodes: [node("source", "source", "load"), node("q1", "queue", "infra"), node("filter", "filter", "service"), node("q2", "queue", "infra"), node("sink", "sink", "store")],
    edges: chain("source", "q1", "filter", "q2", "sink"),
  },
  "011": {
    nodes: [node("producer", "producer", "load"), node("queue", "queue", "infra"), ...WORKERS_3, node("join", "join", "service"), DB],
    edges: [...chain("producer", "queue"), ...fan("queue", WORKERS_3), ...join(WORKERS_3, "join"), ...chain("join", "db")],
  },
};

const upcoming = (p: Project): Learning => {
  const plan = PLANNED[p.id];
  if (plan === undefined) throw new Error(`learning: no planned architecture for ${p.id}`);
  return { learned: null, flaws: null, architecture: { summary: p.question, ...plan } };
};

export const LEARNING: Record<ProjectId, Learning> = Object.fromEntries(
  PROJECTS.map((p) => [p.id, p.id === "000" ? BASELINE : upcoming(p)]),
);
