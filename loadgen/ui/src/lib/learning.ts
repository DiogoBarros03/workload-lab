import { PROJECTS, type Project } from "./projects";
import type { Op } from "./run";

export type ProjectId = Project["id"];
export type ArchKind = "load" | "service" | "store" | "infra";
export type ArchNode = { id: string; label: string; sub?: string; kind: ArchKind; group?: string };
export type ArchEdge = { from: string; to: string; label?: string };
export type Architecture = { summary: string; nodes: ArchNode[]; edges: ArchEdge[] };
// A one-click preset run; the note is one line of prose that links onward.
export type QuickTest = { label: string; op: Op; rps: number; durationSec: number; note: string };
// null prose means the project is not built, so nothing is measured yet.
export type Lesson = {
  story: string[];
  handsOn: string | null;
  changed: string[] | null;
  learned: string[] | null;
  summary: string[] | null;
  architecture: Architecture;
  flaws: string[] | null;
  quick: QuickTest[];
  // The results/ file key of the recorded runs, null until measured.
  measured: string | null;
  // One closing paragraph on the same runs repeated on the cluster.
  onKubernetes: string | null;
};

const node = (id: string, label: string, kind: ArchKind, extra: Partial<ArchNode> = {}): ArchNode => ({ id, label, kind, ...extra });
const chain = (...ids: string[]): ArchEdge[] => ids.slice(1).map((to, i) => ({ from: ids[i], to }));
// Every member of a group, numbered, drawn side by side.
const many = (prefix: string, label: string, kind: ArchKind, group: string, count: number): ArchNode[] =>
  Array.from({ length: count }, (_, i) => node(`${prefix}-${i + 1}`, label, kind, { group }));
const fan = (from: string, to: ArchNode[]): ArchEdge[] => to.map((n) => ({ from, to: n.id }));
const join = (from: ArchNode[], to: string): ArchEdge[] => from.map((n) => ({ from: n.id, to }));

const LOADGEN = node("loadgen", "loadgen", "load");
const DB = node("db", "db", "store", { sub: "Postgres 16" });

const BASELINE: Lesson = {
  measured: "000-baseline",
  onKubernetes:
    "The same runs on the Kubernetes cluster that [[001]] introduces give the same picture: reads at 3 000 a second in 9 ms, the write knee near 840 a second with 2 883 requests waiting for the pool, and the kernel killing the API past it. Full numbers are in `results/000-k8s.md`.",
  quick: [
    { label: "Read 1 000", op: "read", rps: 1000, durationSec: 20, note: "Comfortable. The API uses a quarter of its CPU quota." },
    { label: "Write 1 000", op: "write", rps: 1000, durationSec: 20, note: "Degraded. The **connection pool** fills and requests queue; [[009]] moves writes off the request path." },
    { label: "Mixed 1 000", op: "mixed", rps: 1000, durationSec: 20, note: "Comfortable. Half reads, half writes." },
    { label: "Read 5 000", op: "read", rps: 5000, durationSec: 20, note: "Fails. **CPU quota** and **memory** both reach their limits; [[004]] adds replicas." },
    { label: "Write 3 000", op: "write", rps: 3000, durationSec: 20, note: "Fails. The backlog fills memory and the API is killed; it restarts on its own." },
  ],
  story: [
    "For most of computing's history an application was **one program on one machine**. The code, the data and every user's request lived in a single process, and when it got slow _the answer was a faster computer_. That stopped working for two reasons. The number of people using a popular application outgrew what any one machine could serve, and a single machine failing took the whole application with it.",
    "So the applications we use every day became **distributed systems**: their parts run as separate services, often on separate machines, and talk to each other over a network. We do this to handle _more work than one machine can_, to keep running when a part fails, and to add or remove capacity as demand and budget change. Almost every pattern in this book exists to make one of those three things safer or cheaper.",
    "Splitting a system into parts is also where the trouble starts. A call over the network can be slow or lost. Two services can disagree about what is true. Every part has its own limit, and the **limits interact** in ways that are hard to predict from a diagram. Before we apply any pattern it is worth seeing, _in numbers_, what the simplest possible arrangement can and cannot do.",
    "That is this project. A bookstore API in one small container and its database in another is already a **tiny distributed system**: two processes, one network hop, and real limits on CPU, memory and connections. We push traffic through it at increasing rates and watch _where it strains_. Everything that follows is measured against what we see here.",
  ],
  handsOn:
    "**Start the containers**, pick reads, writes or a mix, choose a rate, and run. The diagram shows the traffic moving through the system as it happens; the chart underneath tracks throughput and latency; the Measured table holds runs we already recorded so you can reproduce any of them with one click. Watch the API's CPU on reads, the database pool on writes, and _memory whenever the queue grows faster than it drains_.",
  changed: [
    "Compared with a single program that keeps its data in its own memory, this baseline already makes one distributed-systems decision: the API and the database are **separate services** with a network between them. That buys three things. The two can be given different resources, so the database's memory is not competing with the API's request handling. The API can crash and restart _without losing a single row_. And either one can be replaced or upgraded without touching the other.",
    "It also introduces the costs that every later project has to manage. Each request now pays for a network round trip and holds one of a small number of database connections for as long as its query takes. That **pool of connections** is a new kind of limit: it has nothing to do with CPU or memory, and as the numbers show, it is _the first thing that runs out under write load_.",
  ],
  summary: [
    "One API container and one database container serve **a few thousand reads or a few hundred writes per second** before they run out of processor time or connections. Past that point they do not fail cleanly: requests wait and latency climbs to seconds; under write load the backlog fills memory and the kernel kills the process. A bigger box _moves that point without removing it_.",
    "The next projects keep this exact workload and change **one thing at a time**: a sidecar next to the API, an ambassador in front of the database, several API replicas behind a load balancer, a queue between the API and the writes. Each one is a different answer to the same question this baseline leaves open: _how do we handle more work with the same or fewer resources?_",
  ],
  learned: [
    "This project starts with the **simplest shape** a service can have: one container for the API, one for the database, and nothing between them. It works well while traffic is light. A hundred requests a second barely register, and a thousand reads a second still come back in a few milliseconds; a thousand writes a second is already _more than the database connections can absorb_.",
    "The trouble begins when users keep arriving. Every request needs a slice of the API's processor time and a turn on one of its ten database connections. Once those are fully used, new requests do not fail; **they wait**. Each waiting request keeps a socket open and a place in the line for a connection, so memory grows with the **backlog**. Reads exhaust the processor first and degrade: at five thousand a second the API keeps answering, slowly, falls a quarter short of the target rate, and drops or fails about one request in eight. Writes exhaust the connections first, at only a few hundred a second, and their backlog grows until the container runs out of memory and the kernel kills it. From the outside the service goes _from fast to slow and, on writes, to gone_.",
    "The obvious answer is **a bigger box**: more CPU, more memory, more connections. It moves the tipping point, but it does not remove it, and it makes every request more expensive whether the system is busy or idle. Growth is not the problem to solve; _the shape of the system is_.",
    "That is what the rest of this lab is about. Each following project adds **one architectural idea** from the book, such as running several copies behind a load balancer, moving writes onto a queue, or splitting the data across shards, and measures the same workload again. The goal is to handle _more work with fewer resources_, so the system stays fast and affordable as it grows, instead of paying for headroom it rarely uses.",
  ],
  architecture: {
    summary: "One synchronous request path. Each request holds a pooled connection for the duration of its query; nothing queues, retries, or sheds load.",
    nodes: [
      node("loadgen", "loadgen", "load", { sub: "unlimited" }),
      node("api", "api", "service", { sub: "0.5 CPU · 128 MiB · pool 10" }),
      node("db", "db", "store", { sub: "1 CPU · 256 MiB" }),
    ],
    edges: [{ from: "loadgen", to: "api", label: "HTTP, fixed rate" }, { from: "api", to: "db", label: "SQL, 10 connections" }],
  },
  flaws: [
    "Everything depends on **one copy of each part**. If the API's container is full, no other container can take the overflow; if it crashes, nothing answers until it restarts; if the database is unreachable, every request fails at once. There is no way to add capacity except to _make the single box bigger_.",
    "Nothing protects the system from **its own callers**. The API accepts every request that arrives and lets it wait for as long as it takes, so a burst of traffic turns into a backlog that consumes memory instead of being _turned away early_. It also has no notion of retrying, timing out, or backing off when the database is slow, so a small hiccup downstream becomes a wave of errors upstream.",
    "The limits are **guesses**. Ten database connections were chosen without measuring what the database could actually serve, and that guess is the ceiling for writes. A system that _cannot see its own bottleneck_ cannot fix it.",
  ],
};

const SIDECAR: Lesson = {
  measured: "001-sidecar",
  onKubernetes: null,
  quick: [
    { label: "Read 1 000", op: "read", rps: 1000, durationSec: 20, note: "Comfortable. The sidecar's CPU reading sits below the cgroup's." },
    { label: "Write 1 000", op: "write", rps: 1000, durationSec: 20, note: "Failed once. The **pool** fills; one pass was OOM-killed, the other only degraded." },
    { label: "Mixed 1 000", op: "mixed", rps: 1000, durationSec: 20, note: "Comfortable." },
    { label: "Read 5 000", op: "read", rps: 5000, durationSec: 20, note: "Degraded. The API is on its **CPU quota** and the sidecar cannot see the throttling." },
    { label: "Write 3 000", op: "write", rps: 3000, durationSec: 20, note: "Fails. Kubernetes restarts the API mid-run; [[009]] moves writes off the request path." },
  ],
  story: [
    "In [[000]] we saw that a single API container reaches its CPU limit on reads and its connection limit on writes, and that we could only see this because the API reported its own counters. A **sidecar** is a second container that runs beside the API in the same pod and takes on a concern the API should not have to carry, such as collecting and exposing metrics or logs. This project asks _whether we can add that observability without changing the API image at all_.",
    "This is also the first project that runs on **Kubernetes**. The cluster is three podman containers acting as nodes, created from one file in the repo, so anyone can have the same one on a laptop. Before adding the sidecar we ran the baseline there unchanged: reads at 3 000 a second answered in 9 ms, writes hit the same pool of ten near 840 a second, and past that the kernel killed the API exactly as in [[000]]. _The platform changed; the limits did not_, which is what makes the comparison below fair.",
  ],
  handsOn:
    "**Create the cluster** if it is not running, start the containers, and run the same quick tests as in [[000]]. The diagram now shows a pod with two containers: the API and the sidecar beside it, sharing the pod's limits. The sidecar reports the API's CPU and memory from the outside, and the database's load from its own connection; _compare its numbers with what the API reported about itself in the baseline_.",
  changed: [
    "The API image is **byte-for-byte the one** from [[000]]. What changed is the pod around it: a second container, the sidecar, starts next to the API, shares its process namespace, and serves the `/stats` endpoint the API used to serve itself. The load generator now reads observability from the sidecar's port, and the API's own copy of that code is simply unused. This is the sidecar pattern: a concern the application should not carry, attached at deployment time rather than written into the code.",
    "It buys independence. The sidecar can be upgraded, restarted or replaced without touching the API, and it keeps answering while the API restarts. It costs a little: its own 0.1 CPU and 64 MiB, one more database connection, and one more thing to schedule. _Whether the cost is measurable is the question this project answers_.",
  ],
  learned: [
    "The sidecar is **free at the rates that matter**. Through 3 000 reads a second the numbers with and without it are the same: 2 999 versus 2 997 requests a second, p99 9.0 versus 9.1 milliseconds. The write knee is unchanged too, still the pool of ten near 900 requests a second. At 5 000 reads the API sits on its 0.5-core quota with or without a sidecar; that limit belongs to the API, not to the pattern.",
    "A sidecar sees the **process, not the kernel's accounting**. Reading `/proc`, it reported 0.09 cores where the cgroup counted 0.17, and 0.37 where the cgroup was pinned at its 0.50 quota. It never saw the 75 throttled periods at 5 000 reads, because throttling is a cgroup fact with no trace in `/proc`. Its memory figure disagreed in the other direction, 161 MiB against the cgroup's 126 MiB, because resident set size counts shared pages the cgroup does not. _Honest, and incomplete_.",
    "That gap is not a bug to fix in the sidecar; it is the reason the next pattern exists. Observability that must match what the scheduler enforces has to come from the node, not from a neighbour in the pod. The adapter in [[003]] and, later, the cluster's own metrics take that role. The sidecar's job was to move the concern out of the application, and that part worked.",
    "Kubernetes changed how failure looks. On compose the killed API stayed dead until a restart policy brought it back; here the scheduler restarts it within the run, so a write run at 2 000 a second shows two restarts and a goodput of a few hundred requests a second instead of a dead service. _Faster recovery is not the same as higher capacity_: the limit that killed it is untouched.",
  ],
  summary: [
    "Moving observability into a sidecar costs nothing the load can measure and removes code from the application, which is the point of the pattern. The same measurements show its ceiling: from inside the pod, a sidecar knows what the process does, not what the kernel does to it.",
    "The cluster is now the lab's platform, and the baseline reproduces on it. The next projects build on both: [[002]] puts an ambassador in front of the database connection, the limit every write run keeps hitting.",
  ],
  architecture: {
    summary: "One pod, two containers: the API serves traffic, the sidecar watches it through the shared process namespace and serves metrics on its own port; both share the pod's limits.",
    nodes: [
      node("loadgen", "loadgen", "load", { sub: "unlimited" }),
      node("api", "api", "service", { group: "Pod", sub: "0.5 CPU · 128 MiB · pool 10" }),
      node("sidecar", "stats-sidecar", "infra", { group: "Pod", sub: "0.1 CPU · 64 MiB · /proc" }),
      node("db", "db", "store", { sub: "1 CPU · 256 MiB" }),
    ],
    edges: [
      { from: "loadgen", to: "api", label: "HTTP" }, { from: "api", to: "db", label: "11 connections" },
      { from: "sidecar", to: "db", label: "SQL, 1 connection" },
    ],
  },
  flaws: [
    "The sidecar's numbers cannot be trusted for limits. It under-reports CPU, over-reports memory and cannot see throttling, so a dashboard built on it would miss the moment the API is being held back.",
    "Every pod restart is a cold start for observability too. The sidecar keeps its port open, but the counters it reads reset with the process, so a run that kills the API loses the samples that would have explained the kill.",
    "The write path is untouched. Ten connections and no backpressure are exactly the flaws of [[000]], carried into every project until one of them addresses the connection to the database.",
  ],
};

const REPLICAS = many("api", "api", "service", "Replicas", 3);
const SHARDS = [node("db-a", "db-a", "store", { group: "Shards" }), node("db-b", "db-b", "store", { group: "Shards" })];
const LEAVES = many("leaf", "leaf", "service", "Leaves", 3);
const FUNCTIONS = many("fn", "function", "service", "Functions", 3);
const WORKERS_2 = many("worker", "worker", "service", "Workers", 2);
const WORKERS_3 = many("worker", "worker", "service", "Workers", 3);

// Planned diagrams for projects not built yet.
const PLANNED: Record<string, Omit<Architecture, "summary">> = {
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

// The opening story of each project not built yet.
const STORIES: Record<string, string> = {
  "002": "In [[000]] a slow or unreachable database turned straight into errors for every caller, and in [[001]] we moved observability out of the API. An **ambassador** goes one step further: a container next to the API that owns the connection to the database, adding retries, timeouts and a circuit breaker on the API's behalf. The question is _whether resilience can live outside the application code_.",
  "003": "[[001]] and [[002]] put helper containers beside the API. An **adapter** uses the same idea to translate: it presents one standard monitoring interface no matter which implementation of the API is running behind it. This project asks _whether two different implementations can be measured with exactly the same dashboard_.",
  "004": "[[000]] ended with a single container out of CPU on reads at a few thousand requests per second. The first answer any operator reaches for is more copies: several identical API containers behind a **load balancer**, each taking a share of the traffic. This project measures _whether the read limit moves in proportion to the number of replicas, and what the single database does when several APIs are writing to it at once_.",
  "005": "If [[004]] moved the API's limit, the database becomes the wall. **Sharding** splits the data by key across several databases so each holds and serves a part of it. This project asks _whether that raises the write limit, what it costs in complexity, and what happens to queries that need more than one shard_.",
  "006": "Once data is sharded as in [[005]], some requests need an answer from every shard. **Scatter/gather** sends the request to all of them and merges the replies. The cost is that the slowest shard sets the latency of the whole request; this project measures _that amplification_.",
  "007": "Every project so far kept a container running whether or not traffic arrived. **Functions as a service** start a process per request and stop it after. This project runs the same bookstore operations as functions and _compares cold starts and cost against the always-on baseline_ of [[000]].",
  "008": "With several replicas as in [[004]], some jobs must run exactly once: a nightly report, a cleanup. **Ownership election** lets the replicas agree on which one holds that responsibility, and hand it over when the owner dies. This project _builds the election and breaks the owner on purpose_.",
  "009": "[[000]] showed writes queueing for the database pool and taking the whole API down with them. A **work queue** takes the write off the request path: the API records the job and answers at once, and a worker applies it later. This project measures _the latency the caller sees against what durability we give up_.",
  "010": "[[009]] introduced a queue with one worker. **Event-driven batch processing** chains several: filters, fan-out to many workers, fan-in to one. This project builds a small pipeline on the bookstore data and measures _throughput at each stage_.",
  "011": "Where [[010]] streamed events through independent stages, some work needs all workers to reach a point together: join the results, then reduce. This project adds that **coordination** and measures _what the barrier costs_.",
};

const upcoming = (p: Project): Lesson => {
  const plan = PLANNED[p.id];
  const story = STORIES[p.id];
  if (plan === undefined || story === undefined) throw new Error(`lessons: no planned architecture or story for ${p.id}`);
  return {
    story: [story], handsOn: null, changed: null, learned: null, summary: null, flaws: null, quick: [], measured: null, onKubernetes: null,
    architecture: { summary: p.question, ...plan },
  };
};

const BUILT: Record<string, Lesson> = { "000": BASELINE, "001": SIDECAR };

export const LESSONS: Record<ProjectId, Lesson> = Object.fromEntries(
  PROJECTS.map((p) => [p.id, BUILT[p.id] ?? upcoming(p)]),
);
