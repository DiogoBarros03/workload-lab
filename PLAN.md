# workload-lab — Plan v2

Simulate many workload types in Node and C#, run them locally / Compose / **Kubernetes**,
across four variants (direct → cache → queue → cache+queue), and measure what each one
breaks. Agents build. You review. Every challenge ends with a written result or a green
acceptance check — nothing is "done" on a feeling.

---

## You are the brain

1. Activate Serena on this repo and run onboarding once. Start a fresh session after.
2. Review `.serena/memories/`; add `conventions.md` with the rules below and the folder map.
3. Delegate one challenge per agent. Never write service code yourself.
4. Accept a challenge only when every box under **Accept when** is ticked. Reject otherwise.
5. Challenges in the same wave run in parallel. Waves run in order.

### Rules — every agent gets these five lines

- Use Serena for navigation and edits.
- Use any available skill that fits the task before hand-rolling it.
- Cyclomatic complexity ≤ 10 per function. Lint fails above.
- Write only inside your owner folder. Read anywhere.
- Done = every acceptance box ticked and `just contract <url>` green.

---

## Fixed decisions

- Languages: Node (Fastify, TypeScript) and C# (ASP.NET Core minimal API).
- One codebase per service. Variants are env flags: `CACHE=off|redis`,
  `WORK=sync|queue`, `QUEUE=memory|redis|rabbitmq`.
- `spec/` is the contract. Both languages implement it identically, including metric names.
- `just` is the single entry point: `just up <variant>`, `just load <profile> <url>`,
  `just contract <url>`, `just k8s <overlay>`.
- Every experiment writes `results/NNN-name.md` using the template at the end.

### Layout

```
spec/            openapi.yaml, metrics.md, knobs.md, tests/
services/        api-node  api-dotnet  worker-node  worker-dotnet  downstream-sim
deploy/          local/  compose/  k8s/{base,overlays/v0..v3,infra}
loadtest/k6/     profiles: constant, ramp, spike, soak
observability/   prometheus/  grafana/dashboards/
results/         experiment reports
tasks/           one file per challenge (created in C00)
```

---

## Challenges

Format: **Owner** folder · **Needs** prior challenges · **Build** · **Accept when**.
Each adds exactly one thing. Keep it that small.

### Wave 0 — foundation (brain only, sequential)

**C00 · Repo skeleton + tooling**
Owner: root · Needs: —
Build: folders above, `justfile` with stub targets, lint + complexity check in CI,
split this section into `tasks/CNN-name.md`.
Accept when:
- [ ] `.serena/project.yml` exists and `.serena/memories/conventions.md` states the rules
- [ ] `just test` and `just lint` run green on an empty repo
- [ ] `tasks/` has one file per challenge with the same content as here

**C01 · Contract**
Owner: `spec/` · Needs: C00
Build: `openapi.yaml`, `metrics.md` (exact names, labels, units), `knobs.md` (every env
var and query param), and a contract test suite runnable against any base URL.
Accept when:
- [ ] every endpoint in the table below has ≥1 contract test
- [ ] `just contract http://localhost:9999` against a 501-stub fails with one line per endpoint
- [ ] metric list is exhaustive — an implementation exposing an unlisted metric fails the suite
- [ ] you have reviewed and signed the file (comment at top with date)

Endpoints: `/cpu` `/io` `/fanout` `/flaky` `/memory` `/catalog/:id` `POST /jobs`
`GET /jobs/:id` `/healthz` `/readyz` `/metrics`. Labels `impl=node|dotnet`,
`variant=v0|v1|v2|v3` on every metric.

### Wave 1 — first vertical slice (Node only)

**C02 · downstream-sim**
Owner: `services/downstream-sim` · Needs: C01
Build: Node service. `GET /call` returns after configured latency. `PUT /config` sets
`latency_ms, jitter_ms, error_rate, timeout_rate, rate_limit_rps`. Counts calls.
Accept when:
- [ ] latency 100 / jitter 20 → 1000 requests give p50 within 100 ± 15 ms
- [ ] `error_rate: 0.2` → 15–25 % of responses are 5xx
- [ ] above `rate_limit_rps` returns 429
- [ ] `GET /stats` reports total calls; reset via `DELETE /stats`

**C03 · api-node skeleton**
Owner: `services/api-node` · Needs: C01
Build: Fastify, `/healthz` `/readyz` `/metrics`, JSON logs with request id, graceful
shutdown, Dockerfile.
Accept when:
- [ ] contract tests for the three endpoints pass
- [ ] SIGTERM during an in-flight request: request completes, new ones refused, exit 0
      within `GRACEFUL_SHUTDOWN_MS`
- [ ] `docker run` of the image serves `/healthz`

**C04 · /cpu and /memory**
Owner: `services/api-node` · Needs: C03
Build: `/cpu?ms=&rounds=` (hash rounds), `/memory?mb=&hold_ms=`.
Accept when:
- [ ] contract tests pass
- [ ] `results/001-node-event-loop.md`: with `/cpu?ms=200` under load, concurrent
      `/healthz` p99 is measured and the blocking is explained in ≤5 lines

**C05 · /io and /fanout**
Owner: `services/api-node` · Needs: C03, C02
Build: `/io?ms=&jitter=` calls the sim once. `/fanout?n=&mode=parallel|serial` calls it
n times. `DOWNSTREAM_TIMEOUT_MS` honoured → 504.
Accept when:
- [ ] contract tests pass
- [ ] timeout returns 504 within `timeout + 50 ms`
- [ ] `results/002-tail-latency.md`: fanout n=10 parallel p99 vs single-call p99, same profile

**C06 · /flaky + retries + breaker**
Owner: `services/api-node` · Needs: C05
Build: `/flaky?error_rate=&timeout_rate=`. Knobs `RETRY_MAX`, `RETRY_BACKOFF_MS`
(with jitter), `BREAKER=off|on`.
Accept when:
- [ ] sim `error_rate 0.5`, `RETRY_MAX=3` → client-visible error rate < 15 %
- [ ] breaker opens after N consecutive failures; while open, responds 503 in < 5 ms and
      sim call count does not increase
- [ ] breaker half-opens and recovers when sim is healthy again

**C07 · k6 profiles**
Owner: `loadtest/` · Needs: C01
Build: `constant`, `ramp`, `spike`, `soak` scripts. `just load <profile> <url>`.
Accept when:
- [ ] each profile runs against api-node and writes a JSON summary to `results/raw/`
- [ ] every profile is parameterised by env only — no editing scripts between runs
- [ ] `profiles.md` states RPS, duration, and thresholds for each

**C08 · Observability**
Owner: `observability/` · Needs: C03
Build: Prometheus scrape config, Grafana provisioned as code, one dashboard.
Accept when:
- [ ] dashboard shows p50/p95/p99, error rate, inflight, split by `impl` and `variant`
- [ ] zero manual clicks: `just up v0` brings it up with the dashboard already loaded
- [ ] a k6 `constant` run is visible on it end to end

### Wave 2 — C# parity

**C09 · api-dotnet**
Owner: `services/api-dotnet` · Needs: C01, C02
Build: the full contract, same knobs, Dockerfile.
Accept when:
- [ ] `just contract` passes with the suite unchanged
- [ ] metric name set from `/metrics` is identical to api-node (diff is empty)
- [ ] `results/003-node-vs-dotnet-cpu.md`: `/cpu` and `/fanout`, same profile, both impls

### Wave 3 — variants

**C10 · Catalog + cache (v1)**
Owner: `services/api-node`, `services/api-dotnet` (two agents) · Needs: C09
Build: `/catalog/:id` reads from the sim. `CACHE=redis` → cache-aside with TTL.
Accept when:
- [ ] `cache_operations_total{result}` emitted
- [ ] `results/004-cache.md`: p95 warm vs off; 200 concurrent cold-key requests → number of
      sim calls recorded (this is the stampede baseline; fixing it is C22)

**C11 · Jobs sync (v0 baseline)**
Owner: both APIs · Needs: C09
Build: `POST /jobs` with `WORK=sync` runs the job inline and returns 200 with result.
Accept when:
- [ ] contract tests pass
- [ ] `results/005-sync-jobs.md`: `spike` profile → p99 and error rate recorded

**C12 · Queue + worker-node (v2)**
Owner: `services/worker-node` + api changes · Needs: C11
Build: `WORK=queue` → 202 + id, `GET /jobs/:id`. Worker with `BATCH_SIZE`,
`CONCURRENCY`, retry with backoff, DLQ. `QUEUE=memory|redis`. Emit `queue_depth`,
`queue_lag_seconds`, `jobs_processed_total{outcome}`.
Accept when:
- [ ] `spike` profile: API p99 stays under the `constant` p99 while `queue_depth` grows, then drains
- [ ] kill the worker mid-batch with `QUEUE=redis`: no job lost; duplicates counted and recorded
- [ ] same test with `QUEUE=memory`: loss recorded — this is the point
- [ ] a poison job lands in the DLQ after `RETRY_MAX`

**C13 · worker-dotnet**
Owner: `services/worker-dotnet` · Needs: C12
Accept when:
- [ ] all C12 acceptance tests pass against the .NET worker unchanged

**C14 · RabbitMQ backend**
Owner: both workers · Needs: C13
Accept when:
- [ ] all C12 tests pass with `QUEUE=rabbitmq`
- [ ] `results/006-queue-backends.md`: memory vs redis vs rabbitmq — loss, duplicates,
      ordering, throughput, one table

**C15 · Cache + queue (v3)**
Owner: both APIs · Needs: C10, C12
Build: both flags on. Job completion invalidates the catalog cache.
Accept when:
- [ ] `results/007-v3-staleness.md`: measured window during which `/catalog` returns
      stale data after a job completes, and whether v3 beat v2 on the `spike` profile

**C16 · Compose profiles**
Owner: `deploy/compose` · Needs: C08, C15
Accept when:
- [ ] `just up v0` … `just up v3` each bring up the right set of containers
- [ ] `just load spike` runs against any of them without changes

### Wave 4 — Kubernetes (primary target)

**C17 · Kustomize base + overlays**
Owner: `deploy/k8s` · Needs: C16
Build: base with Deployment, Service, probes, requests/limits, PDB, `preStop`;
overlays v0–v3; infra (redis, rabbitmq, prometheus, grafana).
Accept when:
- [ ] `just k8s v2` on kind → all pods Ready, `just contract` green through port-forward
- [ ] rollout during `constant` load: 5xx count recorded in `results/008-rollout.md`
- [ ] removing `preStop` and repeating shows a higher 5xx count (proves it works)

**C18 · Autoscaling**
Owner: `deploy/k8s` · Needs: C17
Build: HPA on CPU for APIs; HPA on `queue_depth` for workers (KEDA or prometheus-adapter).
Accept when:
- [ ] `spike` → worker replicas scale up on queue depth and back down after drain
- [ ] `results/009-hpa.md`: `/io` under load does not trigger CPU-based HPA while p99 degrades

### Wave 5 — failure experiments (one agent each, results only)

Each accepts when its `results/NNN-*.md` exists with the template filled and a ≤5-line conclusion.

- **C19** CFS throttling: `/cpu` with `limits.cpu: 500m` — p99 vs `container_cpu_cfs_throttled_seconds_total`
- **C20** Readiness vs liveness: block the event loop; compare pod removal vs restart loop
- **C21** OOMKill: `/memory` against a memory limit, Node vs .NET behaviour
- **C22** Retry storm: retries on, sim slow, no breaker → outage; breaker on → recovery

### Wave 6 — improvements (measure → change → measure, same profile)

- **C23** `/cpu` on worker threads (Node) — `/healthz` p99 before/after
- **C24** Single-flight on catalog cache — sim calls on cold key before/after
- **C25** Hedged requests on `/fanout` — p99 before/after
- **C26** Load shedding (`SHED_QUEUE_LIMIT`) — error rate vs p99 under `spike`
- **C27** Idempotency keys on `POST /jobs` — duplicate side effects before/after
- **C28** Final report: all four variants, both impls, one table, what you would ship

---

## Results template

```markdown
# NNN — title
Hypothesis:
Setup: target (local|compose|k8s) · overlay · impl · replicas · profile
Numbers: p50 / p95 / p99 · error % · saturation (CPU, mem, queue depth, restarts)
What broke:
Conclusion (≤5 lines):
```

Rules: one variable per run, warm-up discarded, three runs before believing a number.
