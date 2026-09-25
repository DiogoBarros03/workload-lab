# learning — Designing Distributed Systems, by hand

A lab for working through *Designing Distributed Systems* (Brendan Burns) one pattern at a
time, on a deliberately small system, with a load test that proves what each step changes.
Every step ends with a `results/NNN-*.md` file containing real numbers, or it did not happen.

## What this is for

To get better at software engineering and architecture by measuring, not reading. The book
introduces each pattern (sidecar, ambassador, replicated service, sharding, work queue, ...)
as an answer to a problem. This repo makes the problem visible first, on a baseline that is
kept small enough to break on a laptop, then applies the pattern and measures again.

Containers are resource-limited on purpose (API: 0.5 CPU / 128 MiB, DB: 1 CPU / 256 MiB) so
that saturation happens at a scale the machine can generate and you can see it happen.

## What is here

| Path | What |
|---|---|
| `api/` | Node 24 + Fastify + `pg`. CRUD over a small bookstore: `authors` and their `books`. TypeScript run directly, no build step. |
| `db/init.sql` | The schema. Constraints (unique ISBN, foreign key, cascade, checks) live in the database, not in the app. |
| `compose.yaml` | The whole stack: `db`, `api`, `loadgen`, and on-demand services `test`, `loadgen-test` and `k6`. Limits are set here. |
| `loadgen/` | Load generator with a browser UI on http://localhost:3200. Closed model: fixed concurrency, fixed request count. Own container, no limits, so it never shares the API's quota. |
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
| `POST` | `/authors`, `/books` | `201` with the row; `400` on bad input; `409` duplicate ISBN; `404` unknown author |
| `GET` | `/authors?name=&limit=` | `200` with authors ordered by id, exact `name` filter optional (non-empty), `limit` 1..1000 (default 100); `400` on bad query |
| `GET` | `/authors/:id`, `/books/:id` | `200` or `404` |
| `PUT` | `/authors/:id`, `/books/:id` | `200` or `404`; full replace, same body as `POST` |
| `DELETE` | `/authors/:id`, `/books/:id` | `204` or `404` |
| `GET` | `/authors/:id/books` | `200` with the author's books, or `404` |

Unknown fields in a body are dropped.

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
(1..5000), and run. Each run appends a row to the history table so runs can be compared. Before a
run it ensures 20 seed authors with 10 books each; writes go under 20 sink authors; Reset
deletes both (and, by cascade, their books). One run at a time: closing the stream stops the run.
A Containers panel polls `GET /status` every 2 s: each service reads its own cgroup files (the api via `GET /stats`), so CPU, throttling and memory against the limits show without any container runtime socket.

| Method | Path | Answers |
|---|---|---|
| `GET` | `/` | the UI |
| `POST` | `/run` `{op, requests, concurrency}` | Server-Sent Events: `progress` every 500 ms `{done, inFlight, elapsedMs}`, then one `result` (req/s, status counts, network errors, latency p50/p95/p99/max/mean in ms); `409` while a run is active |
| `GET` | `/status` | `{containers: [{service, up, cpuCores, cpuQuotaCores, nrThrottled, memBytes, memMaxBytes}]}` for api, db, loadgen; each service reads its own cgroup, no runtime socket |
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

## Roadmap, in book order

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

Each step: one branch, one hypothesis, the same load levels as the baseline, one results file.
