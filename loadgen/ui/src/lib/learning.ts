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
    "This project starts with the simplest shape a service can have: one container for the API, one for the database, and nothing between them. It works well while traffic is light. A hundred requests a second barely register, and a thousand still come back in a few milliseconds.",
    "The trouble begins when users keep arriving. Every request needs a slice of the API's processor time and a turn on one of its ten database connections. Once those are fully used, new requests do not fail; they wait. Waiting requests pile up in memory, each one holding a connection open, until the container runs out of room and the kernel kills it. From the outside the service goes from fast to slow to gone, and the moment it tips over depends on the kind of work: reads exhaust the processor first, writes exhaust the connections first, at only a few hundred writes a second.",
    "The obvious answer is a bigger box: more CPU, more memory, more connections. It moves the tipping point, but it does not remove it, and it makes every request more expensive whether the system is busy or idle. Growth is not the problem to solve; the shape of the system is.",
    "That is what the rest of this lab is about. Each following project adds one architectural idea from the book, such as running several copies behind a load balancer, moving writes onto a queue, or splitting the data across shards, and measures the same workload again. The goal is to handle more work with fewer resources, so the system stays fast and affordable as it grows, instead of paying for headroom it rarely uses.",
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
    "Everything depends on one copy of each part. If the API's container is full, no other container can take the overflow; if it crashes, nothing answers until it restarts; if the database is unreachable, every request fails at once. There is no way to add capacity except to make the single box bigger.",
    "Nothing protects the system from its own callers. The API accepts every request that arrives and lets it wait for as long as it takes, so a burst of traffic turns into a backlog that consumes memory instead of being turned away early. It also has no notion of retrying, timing out, or backing off when the database is slow, so a small hiccup downstream becomes a wave of errors upstream.",
    "The limits are guesses. Ten database connections were chosen without measuring what the database could actually serve, and that guess is the ceiling for writes. A system that cannot see its own bottleneck cannot fix it.",
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
