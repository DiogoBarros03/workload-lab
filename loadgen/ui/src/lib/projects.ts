import type { Service } from "./status";

export type Project = {
  id: string;
  bookId: string;
  slug: string;
  title: string;
  chapter: string;
  question: string;
  status: "ready" | "upcoming";
  services: readonly Service[];
};

// Every project so far belongs to Designing Distributed Systems.
const p = (id: string, slug: string, title: string, chapter: number, question: string, services: readonly Service[]): Project =>
  ({ id, bookId: "dds", slug, title, chapter: `Ch. ${chapter}`, question, status: id === "000" ? "ready" : "upcoming", services });

// Planned containers; later projects will refine their lists.
const CORE: readonly Service[] = ["api", "db", "loadgen"];

// One project per step of the README roadmap.
export const PROJECTS: readonly Project[] = [
  p("000", "baseline", "Baseline", 1, "How far does one small container get?", CORE),
  p("001", "sidecar", "Sidecar", 2, "Can logging and metrics be added without touching the API image?", CORE),
  p("002", "ambassador", "Ambassador", 3, "Can retries, timeouts and a circuit breaker live outside the app?", CORE),
  p("003", "adapter", "Adapter", 4, "Can the metrics interface be normalised across two implementations?", CORE),
  p("004", "replicated-service", "Replicated load-balanced service", 5, "Do N replicas behind a load balancer move the knee, and what does the DB do?", CORE),
  p("005", "sharded-service", "Sharded service", 6, "When one DB is the wall, does sharding by key help, and what does it cost?", CORE),
  p("006", "scatter-gather", "Scatter/gather", 7, "Fan a request across shards and merge: tail latency amplification.", CORE),
  p("007", "faas", "FaaS", 8, "Same CRUD as functions: cold starts vs the always-on baseline.", CORE),
  p("008", "ownership-election", "Ownership election", 9, "Who runs the singleton job when there are replicas?", CORE),
  p("009", "work-queue", "Work queue", 10, "Move writes off the request path: latency vs durability.", CORE),
  p("010", "event-driven-batch", "Event-driven batch", 11, "Chain queues: fan-out, fan-in, filter.", CORE),
  p("011", "coordinated-batch", "Coordinated batch", 12, "Join and reduce across workers.", CORE),
];

export const hrefOf = (project: Project) => `#/${project.bookId}/${project.id}-${project.slug}`;
// Pre-books form, still resolved so old bookmarks keep working.
const legacyHrefOf = (project: Project) => `#/${project.id}-${project.slug}`;

const FIRST_READY = PROJECTS.find((x) => x.status === "ready");
if (!FIRST_READY) throw new Error("the roadmap has no ready project");
const DEFAULT: Project = FIRST_READY;

export type Route = { kind: "home" } | { kind: "project"; project: Project };

export const HOME_HREF = "#/";
const HOME_HASHES = ["", "#", HOME_HREF];

// Empty hashes go home; unknown ones land on the first ready project.
export const routeFor = (hash: string): Route =>
  HOME_HASHES.includes(hash)
    ? { kind: "home" }
    : { kind: "project", project: PROJECTS.find((x) => hrefOf(x) === hash || legacyHrefOf(x) === hash) ?? DEFAULT };

export const projectOf = (route: Route): Project | null => (route.kind === "project" ? route.project : null);
