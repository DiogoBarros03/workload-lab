# 001 — /cpu blocks the Node event loop

Hypothesis: `/cpu?ms=200` is synchronous, so while it runs nothing else on the event loop can
be served. A concurrent `/healthz` — which does no work at all — should therefore show a p99
of roughly one to four 200 ms blocks instead of its sub-millisecond baseline.

Setup: local · v0 (`CACHE=off`, `WORK=sync`) · node · 1 replica · ad-hoc load, autocannon as a
library (ADR 0006), 10 s per arm, 3 s warm-up per arm discarded, 3 runs, `LOG_LEVEL=warn` ·
host AMD Ryzen 9 7900 (24 threads), 61 GB, Linux 7.1.9-arch1-2, generator and service both in
`docker.io/library/node:24` (Node v24.21.0) on the same machine.
One variable per run: whether `/cpu?ms=200` (2 connections) is loaded alongside `/healthz`
(10 connections). Command: `bash scripts/container.sh docker.io/library/node:24 node
services/api-node/measure/event-loop.mjs`. Raw: `results/raw/001-node-event-loop.json`.

Numbers (ms; autocannon has no p95 bucket, so p97.5 is reported in its place):

| run | arm | rps | mean | p50 | p97.5 | p99 | max |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `/healthz` alone | 54243.6 | 0.02 | 0 | 0 | 0 | 238 |
| 1 | `/healthz` + `/cpu` | 52.0 | 190.37 | 201 | 401 | **407** | 407 |
| 1 | `/cpu?ms=200` | 4.9 | 400.54 | 402 | 602 | 609 | 609 |
| 2 | `/healthz` alone | 70481.5 | 0.01 | 0 | 0 | 0 | 321 |
| 2 | `/healthz` + `/cpu` | 50.0 | 197.43 | 200 | 209 | **210** | 211 |
| 2 | `/cpu?ms=200` | 4.9 | 399.52 | 402 | 414 | 417 | 417 |
| 3 | `/healthz` alone | 73877.8 | 0.01 | 0 | 0 | 0 | 302 |
| 3 | `/healthz` + `/cpu` | 33.3 | 290.17 | 205 | 406 | **601** | 605 |
| 3 | `/cpu?ms=200` | 4.9 | 394.56 | 401 | 609 | 609 | 609 |

- `/healthz` p99: **0 ms baseline → 407 / 210 / 601 ms under `/cpu` load**. Mean goes
  0.01 ms → 190–290 ms; throughput goes ~70 000 rps → 33–52 rps, a 1400× collapse.
- Error rate 0 % in every arm — no non-2xx, no timeouts, no dropped connections.
- Saturation: `/cpu` sustains 4.9 rps × 200 ms of burn = 0.98 CPU-seconds per second, i.e. the
  single event-loop thread is pegged while 23 of 24 host threads sit idle. Memory flat, no
  restarts, no queue (v0).

What broke: nothing errored — that is the finding. The service stayed "healthy" by every
signal a liveness probe can see while being unusable, which is exactly the trap C20 is about.
Separately, `/memory?hold_ms=` longer than `GRACEFUL_SHUTDOWN_MS` is a real failure: with
`GRACEFUL_SHUTDOWN_MS=1000` and `/memory?mb=8&hold_ms=3000` in flight, SIGTERM produced
**exit 1 with the response dropped**. Left as-is deliberately — the drain honestly reports
that it could not finish, and C21 needs `/memory` to outlive the grace period.

Conclusion (≤5 lines):
`/cpu` hashes synchronously on the event loop, so from the first hash to the last no other
request is even read — `/healthz` does not queue behind slow work, it queues behind a thread
that is not running the loop at all. Two concurrent `/cpu?ms=200` requests serialise into
back-to-back 200 ms slices, which is why `/healthz` p99 lands on multiples of ~200 ms
(210 ms ≈ one slice, 407 ms ≈ two, 601 ms ≈ three) rather than degrading smoothly.
Adding cores cannot help a single-threaded loop; only moving the burn off it can, which is C23.
