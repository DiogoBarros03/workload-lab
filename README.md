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
| `api/` | Node 24 + Fastify + `pg`. CRUD over one `items` table. TypeScript run directly, no build step. |
| `db/init.sql` | The schema. Constraints live in the database, not in the app. |
| `compose.yaml` | The whole stack: `db`, `api`, and two on-demand services `test` and `k6`. Limits are set here. |
| `loadtest/crud.js` | k6 script. Fixed request rate (open model), one iteration = create, read, update, delete. |
| `results/` | One markdown file per experiment, raw k6 summaries under `results/raw/`. |

### API

| Method | Path | Answers |
|---|---|---|
| `GET` | `/health` | `200 {status: ok}` or `503` when the DB does not answer |
| `POST` | `/items` | `201` with the item; `400` on bad input |
| `GET` | `/items/:id` | `200` or `404` |
| `PUT` | `/items/:id` | `200` or `404`; `400` on bad input |
| `DELETE` | `/items/:id` | `204` or `404` |

Item body: `{ "name": string (1..200), "quantity": integer >= 0 }`. Unknown fields are dropped.

## Usage

Requires podman with the compose provider (`docker compose` also works as an alias) and the
rootless socket running once: `systemctl --user enable --now podman.socket`.

```sh
podman compose up -d --wait            # db + api, api on http://localhost:3100
podman compose run --rm test           # live test suite against the real Postgres
RPS=100 podman compose run --rm k6     # load at 100 req/s for 30s, summary in results/raw/rps-100.json
podman compose down -v                 # stop and drop the data
```

Knobs, all environment: `RPS` (default 1), `DURATION` (default `30s`).

## Three examples

**1. Talk to it**

```sh
curl -s -XPOST localhost:3100/items -H 'content-type: application/json' -d '{"name":"bolt","quantity":4}'
curl -s localhost:3100/items/1
curl -s -XDELETE -o /dev/null -w '%{http_code}\n' localhost:3100/items/1
```

**2. Find the knee**

```sh
for r in 1 100 1000 3000; do RPS=$r podman compose run --rm k6; done
jq '.metrics | {rps: .http_reqs.rate, p99: .http_req_duration["p(99)"], dropped: .dropped_iterations.count}' results/raw/rps-*.json
```

**3. Watch a limit bite while it runs**

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
