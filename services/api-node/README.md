# api-node

The Node impl of the contract (`CONTEXT.md` — *impl*). C03 built the skeleton
(`/healthz`, `/readyz`, `/metrics`); C04 adds `/cpu` and `/memory`; C05 adds `/io` and
`/fanout`. The rest of the work endpoints arrive in C06 and C10–C12.

Run it: `npm run api` (builds the image and runs it; `API_PORT` picks the host port,
default `8080`).

Verify it: `npm run contract -- http://127.0.0.1:8080`. At C05 seven tests pass and four
fail — the four are `/flaky` (C06), `/catalog/:id` (C10) and the two `/jobs` routes (C11).
`/io` and `/fanout` need a reachable downstream sim, so start one first: `npm run sim`.

## Endpoints

| Route | Does |
|---|---|
| `GET /healthz` | Liveness. `200` whenever the process can answer, never consults a dependency. |
| `GET /readyz` | Readiness. `200` when serving, `503` while starting and from SIGTERM to exit. |
| `GET /metrics` | Prometheus exposition. Empty body until C08 (`spec/metrics.md`). |
| `GET /cpu?ms=&rounds=` | Hashes sha256 in `rounds`-sized batches until `ms` of wall time is gone. Returns the wall time burned, the rounds done and the final digest. |
| `GET /memory?mb=&hold_ms=` | Allocates and fills `mb` MiB, holds it reachable for `hold_ms`, releases and answers. |
| `GET /io?ms=&jitter=` | One downstream sim call, asking for `ms` ± `jitter` latency. Returns the wall time the call took and `attempts`. |
| `GET /fanout?n=&mode=` | `n` downstream sim calls, overlapping (`parallel`) or one after another (`serial`). Returns `{n, mode, ok, failed, ms}`. |

Parameter defaults and bounds are `spec/parameters.md`; the querystring JSON schemas in
`src/app.ts` are that table, and an out-of-range or non-numeric value is a `400`.

Knobs honoured: `PORT` (`8080`), `LOG_LEVEL` (`info`), `GRACEFUL_SHUTDOWN_MS` (`10000`),
`DOWNSTREAM_URL` (`http://127.0.0.1:8090`), `DOWNSTREAM_TIMEOUT_MS` (`1000`).

## Graceful shutdown

On SIGTERM (or SIGINT) the service, within `GRACEFUL_SHUTDOWN_MS`:

1. flips to `shutting_down` — `/readyz` answers `503` immediately, so a load balancer stops
   sending before anything is dropped;
2. **keeps the listener open** and keeps answering the three probes, while every other route
   answers `503 {"error":"shutting_down"}`;
3. waits for in-flight requests to finish, then closes and exits `0`;
4. exits `1` if the deadline arrives first — a forced shutdown dropped requests and should
   not look clean.

Measure it: `bash scripts/container.sh docker.io/library/node:24 node services/api-node/measure/shutdown.mjs`.
The script starts the real app plus one slow route of its own, sends SIGTERM mid-request,
and asserts each half of the acceptance box.

## Measuring the event loop

`bash scripts/container.sh docker.io/library/node:24 node services/api-node/measure/event-loop.mjs`
spawns the real app and runs two autocannon arms per run — `/healthz` alone, then `/healthz`
concurrently with `/cpu?ms=200` — three times, warm-up discarded, `LOG_LEVEL=warn` forced.
Everything is an env knob (`MEASURE_DURATION`, `MEASURE_CPU_MS`, `MEASURE_HEALTH_CONNECTIONS`,
`MEASURE_CPU_CONNECTIONS`, `MEASURE_RUNS`, `MEASURE_PORT`, `MEASURE_RAW`). Result:
`results/001-node-event-loop.md`. C07 replaces the hand-rolled arms with named profiles.

## Measuring the tail

`bash scripts/container.sh docker.io/library/node:24 node services/api-node/measure/tail-latency.mjs`
spawns the real sim **and** the real api as children (`measure/stack.mjs`), sets sim config via
`PUT /config`, resets `/stats` between arms, and runs three arms per run — `/io`, `/fanout`
parallel, `/fanout` serial — three times, warm-up discarded, `LOG_LEVEL=warn`. Result:
`results/002-tail-latency.md`.

`bash scripts/container.sh docker.io/library/node:24 node services/api-node/measure/timeout.mjs`
is the `DOWNSTREAM_TIMEOUT_MS` box: sim `timeout_rate: 1` makes every call hang, and the script
prints the measured elapsed time per probe against the `timeout + 50 ms` budget, exiting `1` if
any probe misses it.

Both are env knobs (`MEASURE_SIM_PORT`, `MEASURE_PORT`, `MEASURE_DURATION`, `MEASURE_WARMUP`,
`MEASURE_CONNECTIONS`, `MEASURE_LATENCY_MS`, `MEASURE_JITTER_MS`, `MEASURE_FANOUT_N`,
`MEASURE_TIMEOUT_RATE`, `MEASURE_MODES`, `MEASURE_RUNS`, `MEASURE_SAMPLES`, `MEASURE_RAW`,
`DOWNSTREAM_TIMEOUT_MS`). **`scripts/container.sh` does not forward host environment into the
container**, so overriding any of them needs `podman run -e ...` against the same image until
that is fixed — it is reported as an open item, and C07 hits it too.

## Decisions a caller depends on

- **The listener stays open during the drain.** Closing it on SIGTERM would make `/readyz`'s
  `503` unobservable, and `spec/openapi.yaml` requires that `503` from SIGTERM until exit.
  It is also what C17's `preStop` needs: the pod must keep answering while the endpoints
  controller catches up.
- **Refusal is `503`, not a dropped connection**, for every route that is not a probe. A
  keep-alive client (autocannon does this) gets an answer it can count rather than a socket
  error it has to guess at.
- **Forced shutdown exits `1`.** Exit `0` means the drain completed.
- **Request logging is on**, so every request-scoped line carries `reqId`; lifecycle lines
  (listening, shutting down) are not request-scoped and carry none. Set `LOG_LEVEL=warn`
  for load runs — two JSON lines per request distorts latency at high RPS.
- **`/cpu` blocks on purpose.** It is synchronous so that C04 can measure the event loop and
  C23 can move it to a worker thread; `results/001-node-event-loop.md` has the numbers.
  `ms=0` (the spec default) burns nothing and returns `rounds: 0` with the unhashed seed.
- **`/memory` is not capped to `GRACEFUL_SHUTDOWN_MS`.** A `hold_ms` longer than the grace
  period keeps the drain open past its deadline, so SIGTERM exits `1` and the response is
  dropped — measured, not assumed. That is the honest signal, and C21 needs an allocation
  that can outlive the grace period.
- **`x-request-id` is honoured and echoed.** An incoming header is reused as the request id;
  otherwise a UUID is generated. Both come back on the response.
- **One deadline covers a whole request, not each call.** `spec/openapi.yaml` says the fanout
  is bounded by `DOWNSTREAM_TIMEOUT_MS`, so all `n` calls share one `AbortSignal.timeout`.
  A serial `n=10` at 100 ms per call therefore needs a timeout above 1 s or it always `504`s;
  that is the contract, not a bug.
- **A downstream non-2xx is a *failed call*, never a 504.** `504` means only "the deadline
  fired". `/fanout` reports failures in `failed`; `/io` has nowhere to report them — the spec
  gives `IoResult` no outcome field and `/io` no 5xx but `503` (breaker) and `504` — so a sim
  `500` currently answers `200`. Flagged for C06, which needs downstream failure to be
  client-visible to measure a retry budget.
- **`attempts` is always `1` at C05.** The field exists now so the response shape never changes
  when `RETRY_MAX` lands in C06.
- **`DOWNSTREAM_URL` defaults to `http://127.0.0.1:8090`** even though `spec/knobs.md` gives it
  no default, so the image still boots and serves `/healthz` without a sim (C03's box).
- **A connection error to the sim is a `500` from `/io` and a `failed` from `/fanout`.**
  Answering `200` for a request that never reached the downstream would be a lie in the
  measurement.
