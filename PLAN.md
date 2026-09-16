# workload-lab — Plan v3

Simulate many workload types in Node and C#, run them locally and on **Kubernetes**, across
four variants (direct → cache → queue → cache+queue), and measure what each one breaks.
Agents build. You review. Every challenge ends with a written result or a green acceptance
check — nothing is "done" on a feeling.

> v2 is in git history at `9baf783`. The decisions that changed it are in `docs/adr/`;
> the vocabulary this plan uses is defined in `CONTEXT.md`. Where any of the three
> disagree, `docs/adr/` wins.

---

## How this runs

1. **You are the brain.** You accept or reject every challenge. Agents never self-accept.
2. **Claude orchestrates.** One agent per challenge, spawned by the session, never by you.
3. **Serial everywhere.** Waves run in order and challenges run in order inside them.
   Wave 5 and 6 experiments share physical hardware, so running them concurrently would
   contaminate the measurements they exist to produce.
4. **A gate after every challenge.** The agent stops, presents evidence for each acceptance
   box, and waits. Unticked box → rejected.
5. **Branch and PR per challenge.** `challenge/C07-load-profiles` → review at the gate →
   squash-merge to `main`. The PR history is the audit trail of the acceptance boxes.
6. **Serena is activated after C00**, against a real folder structure rather than an empty
   repo, and `.serena/memories/conventions.md` is written then.

### Rules — every agent gets these five lines

- Use Serena for navigation and edits.
- Use any available skill that fits the task before hand-rolling it.
- Cyclomatic complexity ≤ 10 per function. Lint fails above.
- Write only inside your owner folder. Read anywhere.
- Done = every acceptance box ticked and `npm run contract -- <url>` green.

---

## Fixed decisions

- **Languages**: Node (Fastify, TypeScript) on **Node 24 LTS**, and C# (ASP.NET Core
  minimal API) on **.NET 10**. → ADR 0008
- **One codebase per service.** Variants are knobs: `CACHE=off|redis`, `WORK=sync|queue`,
  `QUEUE=memory|redis|rabbitmq`.
- **`spec/` is the contract.** Both impls implement it identically. Contract suite is Node
  + vitest, black-box over HTTP, runnable against any base URL.
- **Entry point is npm scripts**: `npm run up -- <variant>`, `npm run load -- <profile> <url>`,
  `npm run contract -- <url>`, `npm run k8s -- <variant>`. No `just`, no Makefile.
- **Everything builds, tests and lints in a container** for both impls. Host SDKs exist
  only so Serena's language servers work. → ADR 0005
- **Load generation is autocannon**, used as a library, parameterised by environment. → ADR 0006
- **Local orchestration is Kubernetes YAML via `podman play kube`.** There is no compose
  file. → ADR 0001
- **Cluster is Talos**, images distributed by an in-cluster registry. → ADR 0002, 0003
- **Verification is contract-first.** No coverage threshold; unit tests only where logic is
  non-trivial. → ADR 0004
- **Job state lives in the queue backend.** → ADR 0007
- Every experiment writes `results/NNN-name.md` using the template at the end.

### Layout

```
spec/            openapi.yaml, metrics.md, knobs.md, parameters.md, tests/
services/        api-node  api-dotnet  worker-node  worker-dotnet  downstream-sim
deploy/          local/            kube YAML run by `podman play kube`
                 k8s/{base,overlays/v0..v3,infra}
loadtest/        autocannon profiles: constant, ramp, spike, soak
observability/   prometheus/  grafana/dashboards/
results/         experiment reports, raw/ for generator output
tasks/           one file per challenge (created in C00)
docs/adr/        decision records
```

---

## Challenges

Format: **Owner** folder · **Needs** prior challenges · **Build** · **Accept when**.
Each adds exactly one thing. Keep it that small.

### Wave 0 — foundation (brain only, sequential)

**C00 · Repo skeleton + tooling**
Owner: root · Needs: —
Build: the folders above, npm scripts with stub targets, eslint with
`complexity: [error, 10]` and a Roslyn/Sonar analyzer at the same threshold, GitHub Actions
running both plus the contract suite in containers, and this section split into
`tasks/CNN-name.md`.
Accept when:
- [ ] `npm run test` and `npm run lint` run green on an empty repo, both inside containers
- [ ] CI runs the same container images on push and is green
- [ ] the complexity ceiling actually fails a deliberately over-complex function, in both languages
- [ ] `tasks/` has one file per challenge with the same content as here
- [ ] Serena is activated, onboarding has run, and `.serena/memories/conventions.md` states
      the five rules and the folder map

**C01 · Contract**
Owner: `spec/` · Needs: C00
Build: `openapi.yaml`; `metrics.md` (exact names, labels, units — **left empty for now**,
see C08); `knobs.md` (deploy-time env vars); `parameters.md` (per-request query params);
and a contract test suite runnable against any base URL.
Accept when:
- [ ] every endpoint in the table below has ≥1 contract test
- [ ] `npm run contract -- http://localhost:9999` against a 501-stub fails with one line per endpoint
- [ ] knobs and parameters are in separate tables and no value appears in both
- [ ] `/metrics` is specified as existing and returning Prometheus text format; its content
      is explicitly deferred to C08
- [ ] you have reviewed and signed the file (comment at top with date)

Endpoints: `/cpu` `/io` `/fanout` `/flaky` `/memory` `/catalog/:id` `POST /jobs`
`GET /jobs/:id` `/healthz` `/readyz` `/metrics`.

### Wave 1 — first vertical slice (Node only)

**C02 · downstream-sim**
Owner: `services/downstream-sim` · Needs: C01
Build: Node service. `GET /call` returns after configured latency. `PUT /config` sets sim
config: `latency_ms, jitter_ms, error_rate, timeout_rate, rate_limit_rps`. Counts calls.
Accept when:
- [ ] latency 100 / jitter 20 → 1000 requests give p50 within 100 ± 15 ms
- [ ] `error_rate: 0.2` → 15–25 % of responses are 5xx
- [ ] above `rate_limit_rps` returns 429
- [ ] `GET /stats` reports total calls; reset via `DELETE /stats`

**C03 · api-node skeleton**
Owner: `services/api-node` · Needs: C01
Build: Fastify, `/healthz` `/readyz` `/metrics` (empty but well-formed), JSON logs with
request id, graceful shutdown, Containerfile on Node 24 LTS.
Accept when:
- [ ] contract tests for the three endpoints pass
- [ ] SIGTERM during an in-flight request: request completes, new ones refused, exit 0
      within `GRACEFUL_SHUTDOWN_MS`
- [ ] `podman run` of the image serves `/healthz`

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

**C07 · Load profiles**
Owner: `loadtest/` · Needs: C01
Build: `constant`, `ramp`, `spike`, `soak` as autocannon-driven scripts.
`npm run load -- <profile> <url>`.
Accept when:
- [ ] each profile runs against api-node and writes a JSON summary to `results/raw/`
- [ ] every profile is parameterised by environment only — no editing scripts between runs
- [ ] `profiles.md` states RPS, duration, and thresholds for each

### Wave 2 — C# parity

**C09 · api-dotnet**
Owner: `services/api-dotnet` · Needs: C01, C02
Build: the full contract on .NET 10, same knobs, Containerfile.
Accept when:
- [ ] `npm run contract` passes with the suite unchanged
- [ ] `results/003-node-vs-dotnet-cpu.md`: `/cpu` and `/fanout`, same profile, both impls,
      noting that this compares an LTS runtime against a current one (ADR 0008)
- [ ] metric-name parity is **deferred to C08** and recorded as an open item

### Wave 3 — variants

**C10 · Catalog + cache (v1)**
Owner: `services/api-node`, `services/api-dotnet` · Needs: C09
Build: `/catalog/:id` reads from the sim. `CACHE=redis` → cache-aside with TTL.
Accept when:
- [ ] `results/004-cache.md`: p95 warm vs off; 200 concurrent cold-key requests → number of
      sim calls recorded (this is the stampede baseline; fixing it is C24)

**C11 · Jobs sync (v0 baseline)**
Owner: both APIs · Needs: C09
Build: `POST /jobs` with `WORK=sync` runs the job inline and returns 200 with result.
Accept when:
- [ ] contract tests pass
- [ ] `results/005-sync-jobs.md`: `spike` profile → p99 and error rate recorded

**C08 · Observability** *(moved here from Wave 1 — the first thing that needs it is C12)*
Owner: `observability/`, `spec/metrics.md` · Needs: C11
Build: fill in `spec/metrics.md` with exact names, labels and units; instrument both impls;
Prometheus scrape config; Grafana provisioned as code; one dashboard.
Accept when:
- [ ] `spec/metrics.md` is exhaustive — an impl exposing an unlisted metric fails the suite
- [ ] metric name set from `/metrics` is identical across impls (diff is empty) — the C09
      open item, closed here
- [ ] labels `impl=node|dotnet` and `variant=v0|v1|v2|v3` are on every metric
- [ ] dashboard shows p50/p95/p99, error rate, inflight, split by `impl` and `variant`
- [ ] zero manual clicks: `npm run up -- v0` brings it up with the dashboard already loaded
- [ ] a `constant` run is visible on it end to end

**C12 · Queue + worker-node (v2)**
Owner: `services/worker-node` + api changes · Needs: C11, C08
Build: `WORK=queue` → 202 + id, `GET /jobs/:id`. Worker with `BATCH_SIZE`, `CONCURRENCY`,
retry with backoff, DLQ. `QUEUE=memory|redis`; job state lives in the queue backend (ADR 0007).
Emit `queue_depth`, `queue_lag_seconds`, `jobs_processed_total{outcome}`.
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
      ordering, throughput, one table, stating that job state moved with the backend (ADR 0007)

**C15 · Cache + queue (v3)**
Owner: both APIs · Needs: C10, C12
Build: both flags on. Job completion invalidates the catalog cache.
Accept when:
- [ ] `results/007-v3-staleness.md`: measured window during which `/catalog` returns stale
      data after a job completes, and whether v3 beat v2 on the `spike` profile

**C16 · Local variants**
Owner: `deploy/local` · Needs: C08, C15
Build: kube YAML per variant, run by `podman play kube`.
Accept when:
- [ ] `npm run up -- v0` … `v3` each bring up the right set of workloads
- [ ] `npm run load -- spike` runs against any of them without changes
- [ ] the YAML is shaped so C17's kustomize base can be derived from it, not rewritten

### Wave 4 — Kubernetes (primary target)

> **Blocked on hardware.** Talos is not installed. The pipeline stops here and waits;
> no substitute distribution is used (ADR 0002).

**C17 · Kustomize base + overlays**
Owner: `deploy/k8s` · Needs: C16, a live Talos cluster
Build: base with Deployment, Service, probes, requests/limits, PDB, `preStop`; overlays
v0–v3; infra (in-cluster registry, redis, rabbitmq, prometheus, grafana); Talos machine
config including the `registries.mirrors` entry for the in-cluster registry (ADR 0003).
Accept when:
- [ ] `npm run k8s -- v2` → all pods Ready, `npm run contract` green through port-forward
- [ ] images are pulled from the in-cluster registry, not side-loaded
- [ ] rollout during `constant` load: 5xx count recorded in `results/008-rollout.md`
- [ ] removing `preStop` and repeating shows a higher 5xx count (proves it works)

**C18 · Autoscaling**
Owner: `deploy/k8s` · Needs: C17
Build: HPA on CPU for APIs; HPA on `queue_depth` for workers (KEDA or prometheus-adapter).
Accept when:
- [ ] `spike` → worker replicas scale up on queue depth and back down after drain
- [ ] `results/009-hpa.md`: `/io` under load does not trigger CPU-based HPA while p99 degrades

### Wave 5 — failure experiments (results only)

Each accepts when its `results/NNN-*.md` exists with the template filled and a ≤5-line conclusion.

- **C19** CFS throttling: `/cpu` with `limits.cpu: 500m` — p99 vs `container_cpu_cfs_throttled_seconds_total`
- **C20** Readiness vs liveness: block the event loop; compare pod removal vs restart loop
- **C21** OOMKill: `/memory` against a memory limit, Node 24 vs .NET 10 behaviour
- **C22** Retry storm: retries on, sim slow, no breaker → outage; breaker on → recovery

### Wave 6 — improvements (measure → change → measure, same profile)

Each improvement's "before" is the commit at the head of the preceding challenge's PR, so
both numbers are reproducible.

- **C23** `/cpu` on worker threads (Node) — `/healthz` p99 before/after
- **C24** Single-flight on catalog cache — sim calls on cold key before/after
- **C25** Hedged requests on `/fanout` — p99 before/after
- **C26** Load shedding (`SHED_QUEUE_LIMIT`) — error rate vs p99 under `spike`
- **C27** Idempotency keys on `POST /jobs` — duplicate side effects before/after
- **C28** Final report: all four variants, both impls, one table, what you would ship

**C29 · README showcase**
Owner: root · Needs: C28
Build: the repo's front door — architecture diagram, the results tables lifted inline, what
each variant broke, what you would ship, and how to run it.
Accept when:
- [ ] every number in the README traces to a file in `results/`
- [ ] a stranger can go from clone to a running v0 using only the README
- [ ] the four failure experiments each get a paragraph and a chart

---

## Results template

```markdown
# NNN — title
Hypothesis:
Setup: target (local|k8s) · variant · impl · replicas · profile · host
Numbers: p50 / p95 / p99 · error % · saturation (CPU, mem, queue depth, restarts)
What broke:
Conclusion (≤5 lines):
```

Rules: one variable per run, warm-up discarded, three runs before believing a number.
