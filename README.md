# Load lab

A place to learn by doing, together. Theory from books, technical decisions, project
write-ups, class notes, technologies and AI: each one becomes something you can run,
measure and argue with, kept in one repo so we can all learn from each other's work.

Reading tells you that a pattern exists. Building it on a deliberately small system, pushing
load through it and watching where it breaks tells you why it exists and what it costs.
Every entry here ends with numbers and a written lesson, or it is not done.

## How it is organised

The browser UI at http://localhost:3200 has a catalogue in its sidebar:

| Category | Holds | Status |
|---|---|---|
| **Books** | A book's ideas, one project per chapter, each measured on the shared lab stack | *Designing Distributed Systems* (Brendan Burns), project 000 done, 001–011 planned |
| **Projects** | Hands-on builds that are not tied to a book: a technical decision, a system, a spike | Empty, waiting for the first one |
| **Classes** | Notes and exercises from courses, turned into runnable experiments | Empty |
| **Technologies** | One tool or runtime at a time: what it is for, where it breaks, how it compares | Empty |
| **AI** | Models, agents, evals and the engineering around them | Empty |

Every entry has the same shape so entries can be compared and read in one sitting:

1. **About**: what runs, why, what to watch. Short.
2. **Measured**: real runs on the lab stack, with a verdict and a one-line cause per run, and a
   "Run this" button that reproduces it.
3. **Learning**: what we learned, the current architecture as a diagram, and its flaws, written
   as plain prose for someone who was not there.

## Adding an entry

1. Pick the category and write the About text first: if you cannot say what to watch, you are
   not ready to measure.
2. Build the smallest thing that makes the question answerable on the lab stack below. Keep the
   resource limits; they are what make saturation visible on a laptop.
3. Measure at the same levels as the baseline (1, 100, 1 000, 3 000, 5 000 requests per second,
   reads and writes) and record the runs in `results/NNN-name.md` plus a `.json` the UI can read.
4. Write the Learning prose: the idea, what the numbers showed, what the architecture still
   cannot do. The Measured table carries the numbers; the prose carries the point.
5. Add the entry to the catalogue in `loadgen/ui/src/lib/` and open a pull request. Review is a
   conversation about the lesson, not only about the code.

The rest of this file is the technical reference for the shared lab stack every entry runs on.

## The lab stack

| Path | What |
|---|---|
| `api/` | Node 24 + Fastify + `pg`. CRUD over a small bookstore: `authors` and their `books`. TypeScript run directly, no build step. |
| `db/init.sql` | The schema. Constraints (unique ISBN, foreign key, cascade, checks) live in the database, not in the app. |
| `compose.yaml` | The whole stack: `db`, `api`, `loadgen`, and on-demand services `test`, `loadgen-test` and `k6`. Limits are set here. |
| `loadgen/` | Load generator and the catalogue UI on http://localhost:3200. Open model (requests per second for a duration) in the UI, closed model (requests at a fixed concurrency) over HTTP. Own container, no limits, so it never shares the API's quota. |
| `loadtest/crud.js` | k6 script. Fixed request rate (open model), one iteration = create author, create book, read, update, list, delete author. |
| `results/` | One markdown file per experiment, raw k6 summaries under `results/raw/`. |

### Domain

A bookstore, kept to two tables so the architecture is the only thing that changes between steps:

- **author**: `name` (1..200), `country` (optional).
- **book**: `author_id`, `title` (1..300), `isbn` (13 digits, unique), `price_cents` (>= 0), `stock` (>= 0, default 0).

Deleting an author deletes their books (database cascade). A duplicate ISBN is a `409`; a book for
an unknown author is a `404`. Both come from the database constraint, not from a lookup in the app.

### API

| Method | Path | Answers |
|---|---|---|
| `GET` | `/health` | `200 {status: ok}` or `503` when the DB does not answer |
| `GET` | `/stats` | `200` with this container's cgroup cpu and memory, `db` (Postgres connections, active and waiting backends, cumulative commit, block and row counters; `null` if the query fails) and `pool` `{max, total, idle, waiting}` |
| `POST` | `/authors`, `/books` | `201` with the row; `400` on bad input; `409` duplicate ISBN; `404` unknown author |
| `GET` | `/authors?name=&limit=` | `200` with authors ordered by id, exact `name` filter optional (non-empty), `limit` 1..1000 (default 100); `400` on bad query |
| `GET` | `/authors/:id`, `/books/:id` | `200` or `404` |
| `PUT` | `/authors/:id`, `/books/:id` | `200` or `404`; full replace, same body as `POST` |
| `DELETE` | `/authors/:id`, `/books/:id` | `204` or `404` |
| `GET` | `/authors/:id/books` | `200` with the author's books, or `404` |

Unknown fields in a body are dropped. While the database is unreachable, routes that need it answer
`503 {error: "database unavailable"}`; the api keeps running and recovers when the database returns.

## Usage

Requires podman with the compose provider (`docker compose` also works as an alias) and the
rootless socket running once: `systemctl --user enable --now podman.socket`.

```sh
podman compose up -d --wait            # db + api + loadgen, api on :3100, loadgen UI on :3200
podman compose run --rm test           # live test suite against the real Postgres
podman compose run --rm loadgen-test   # loadgen tests, live against the running api
RPS=100 podman compose run --rm k6     # load at 100 req/s for 30s, summary in results/raw/rps-100.json
podman compose down -v                 # stop and drop the data
```

Knobs, all environment: `RPS` (default 1), `DURATION` (default `30s`).

`loadgen` starts with `up`. Open http://localhost:3200, pick an operation (`read` = `GET /books/:id`,
`write` = `POST /books`, `mixed` = 50/50), a total request count (1..200000) and a concurrency
(1..5000), and run. Each run appends a row to the history table (kept in the browser's `localStorage`) so runs can be compared. Before a
run it ensures 20 seed authors with 10 books each; writes go under 20 sink authors; Reset
deletes both (and, by cascade, their books). One run at a time: closing the stream stops the run.
A Containers panel polls `GET /status` every 2 s: each service reads its own cgroup files (the api via `GET /stats`), so CPU, throttling and memory against the limits show without any container runtime socket.

The UI is a Vite + React + Tailwind app in `loadgen/ui/`, built into `loadgen/ui/dist` and served
by the loadgen server as static files (the Dockerfile's `ui` stage builds it; its build context is the repo root so the UI can read `results/000-baseline.json`). To work on it, keep
the stack up and run the Vite dev server, which proxies `/run`, `/status` and `/reset` to :3200:

```sh
cd loadgen && npm ci && npm --prefix ui ci
npm run ui:dev         # http://localhost:5173, hot reload
npm run ui:test        # Vitest unit tests for the pure state, SSE and formatting code
npm run ui:typecheck   # tsc -b over ui/
npm run ui:build       # writes ui/dist; rebuild the loadgen image to ship it
```

| Method | Path | Answers |
|---|---|---|
| `GET` | `/` | the UI |
| `POST` | `/run` closed `{op, requests, concurrency}` (`mode` omitted or `"closed"`) or open `{mode: "open", op, rps, durationSec, maxInFlight?}` (rps 1..5000, durationSec 1..300, maxInFlight 1..20000, default 10000) | Server-Sent Events: `progress` every 500 ms `{done, inFlight, elapsedMs, window}` (open adds `dropped`, `targetRps`; `inFlight` is observed), where `window` is `{reqs, rps, p50, p99, errors}` for requests finished since the previous `progress` (p50/p99 `null` when empty; errors = network failures and 4xx/5xx), then one `result` (req/s, status counts, network errors, latency p50/p95/p99/max/mean in ms; open adds `dropped`, `targetRps`, `maxInFlightSeen`, and `rps` is the achieved rate); a request that would exceed `maxInFlight` is dropped, not started; seeding gives each call 5 s, and a failure ends the stream with one `error` event `seed failed: ...`; `409` while a run is active |
| `GET` | `/status` | `{sampledAtMs, containers: [{service, state, up, reason, cpuCores, cpuQuotaCores, nrThrottled, memBytes, memMaxBytes}]}` for api, db, loadgen, the latest snapshot of a sampler that runs every 2 s whoever polls, so every client sees the same rates; each service reads its own cgroup, no runtime socket. `state` is `up`, `slow` or `down` (`up` is `state !== "down"`, `reason` one sentence or null): the api is `slow` when its 3 s probe of `/health` and `/stats` times out within 30 s of the last success, `down` on connection refused, a hostname that does not resolve within 1 s, an HTTP error, or timeouts for 30 s; the db is `down` when `/health` says 503 or the api is down, `slow` while the api is slow. The api answers `/health` and `/stats` from a one-connection admin pool, so a saturated traffic pool does not delay them. The db row adds `connUsed, connMax, activeBackends, waitingBackends, poolBusy, poolMax, poolWaiting` and per-second `commitsPerSec, rowsPerSec, cacheHitRatio` (null on the first sample or a counter reset) |
| `POST` | `/reset` | `{deleted: n}` authors removed; `409` while a run is active |

## Four examples

**1. Talk to it**

```sh
curl -s -XPOST localhost:3100/authors -H 'content-type: application/json' -d '{"name":"Ursula K. Le Guin","country":"US"}'
curl -s -XPOST localhost:3100/books -H 'content-type: application/json' \
  -d '{"author_id":1,"title":"The Dispossessed","isbn":"9780061054884","price_cents":1299,"stock":3}'
curl -s localhost:3100/authors/1/books
curl -s -XDELETE -o /dev/null -w '%{http_code}\n' localhost:3100/authors/1   # cascades to the book
```

**2. Find the knee**

```sh
for r in 1 100 1000 3000; do RPS=$r podman compose run --rm k6; done
jq '.metrics | {rps: .http_reqs.rate, p99: .http_req_duration["p(99)"], dropped: .dropped_iterations.count}' results/raw/rps-*.json
```

**3. Closed-model load from the command line**

```sh
curl -sN -XPOST localhost:3200/run -H 'content-type: application/json' \
  -d '{"op":"write","requests":2000,"concurrency":200}' | tail -2
curl -s -XPOST localhost:3200/reset
```

The last event is the result: req/s, status counts, network errors and latency percentiles. Raise `concurrency` at a fixed `requests` and watch req/s flatten while p99 keeps climbing.

**4. Watch a limit bite while it runs**

```sh
RPS=3000 podman compose run --rm k6 &
podman exec learning-api-1 cat /sys/fs/cgroup/cpu.stat /sys/fs/cgroup/memory.events
```

`nr_throttled` climbing means the CPU quota is the wall; `memory.events max` climbing means
the memory limit is. Both were hit at 3000 RPS, see `results/000-baseline.md`.

## Books · Designing Distributed Systems

One project per chapter, in chapter order. Project pages live in the UI under Books.

| Step | Book | Question the step answers |
|---|---|---|
| 000 | Ch. 1 | Baseline: how far does one small container get? **Done.** |
| 001 | Ch. 2 Sidecar | Can logging/metrics be added without touching the API image? |
| 002 | Ch. 3 Ambassador | Can retries, timeouts and a circuit breaker live outside the app? |
| 003 | Ch. 4 Adapter | Can the metrics interface be normalised across two implementations? |
| 004 | Ch. 5 Replicated load-balanced service | Do N replicas behind a load balancer move the knee, and what does the DB do? |
| 005 | Ch. 6 Sharded service | When one DB is the wall, does sharding by key help, and what does it cost? |
| 006 | Ch. 7 Scatter/gather | Fan a request across shards and merge. Tail latency amplification. |
| 007 | Ch. 8 FaaS | Same CRUD as functions; cold starts vs the always-on baseline. |
| 008 | Ch. 9 Ownership election | Who runs the singleton job when there are replicas? |
| 009 | Ch. 10 Work queue | Move writes off the request path. Latency vs durability. |
| 010 | Ch. 11 Event-driven batch | Chain queues; fan-out, fan-in, filter. |
| 011 | Ch. 12 Coordinated batch | Join and reduce across workers. |

Each project: one branch, one hypothesis, the same load levels as the baseline, one results file.
