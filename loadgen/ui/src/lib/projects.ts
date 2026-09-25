export type Project = {
  id: string;
  slug: string;
  title: string;
  chapter: string;
  question: string;
  status: "ready" | "upcoming";
};

const p = (id: string, slug: string, title: string, chapter: number, question: string): Project =>
  ({ id, slug, title, chapter: `Ch. ${chapter}`, question, status: id === "000" ? "ready" : "upcoming" });

// One project per step of the README roadmap.
export const PROJECTS: readonly Project[] = [
  p("000", "baseline", "Baseline", 1, "How far does one small container get?"),
  p("001", "sidecar", "Sidecar", 2, "Can logging and metrics be added without touching the API image?"),
  p("002", "ambassador", "Ambassador", 3, "Can retries, timeouts and a circuit breaker live outside the app?"),
  p("003", "adapter", "Adapter", 4, "Can the metrics interface be normalised across two implementations?"),
  p("004", "replicated-service", "Replicated load-balanced service", 5, "Do N replicas behind a load balancer move the knee, and what does the DB do?"),
  p("005", "sharded-service", "Sharded service", 6, "When one DB is the wall, does sharding by key help, and what does it cost?"),
  p("006", "scatter-gather", "Scatter/gather", 7, "Fan a request across shards and merge: tail latency amplification."),
  p("007", "faas", "FaaS", 8, "Same CRUD as functions: cold starts vs the always-on baseline."),
  p("008", "ownership-election", "Ownership election", 9, "Who runs the singleton job when there are replicas?"),
  p("009", "work-queue", "Work queue", 10, "Move writes off the request path: latency vs durability."),
  p("010", "event-driven-batch", "Event-driven batch", 11, "Chain queues: fan-out, fan-in, filter."),
  p("011", "coordinated-batch", "Coordinated batch", 12, "Join and reduce across workers."),
];

export const hrefOf = (project: Project) => `#/${project.id}-${project.slug}`;

const FIRST_READY = PROJECTS.find((x) => x.status === "ready");
if (!FIRST_READY) throw new Error("the roadmap has no ready project");
const DEFAULT: Project = FIRST_READY;

// Unknown or empty hashes land on the first ready project.
export const routeFor = (hash: string): Project => PROJECTS.find((x) => hrefOf(x) === hash) ?? DEFAULT;
