# api-node

The Node impl of the contract (`CONTEXT.md` — *impl*). C03 built the skeleton
(`/healthz`, `/readyz`, `/metrics`); C04 adds `/cpu` and `/memory`. The rest of the work
endpoints arrive in C05–C06 and C10–C12.

Run it: `npm run api` (builds the image and runs it; `API_PORT` picks the host port,
default `8080`).

Verify it: `npm run contract -- http://127.0.0.1:8080`. At C04 five tests pass and six
fail — the six are endpoints later challenges own.

## Endpoints

| Route | Does |
|---|---|
| `GET /healthz` | Liveness. `200` whenever the process can answer, never consults a dependency. |
| `GET /readyz` | Readiness. `200` when serving, `503` while starting and from SIGTERM to exit. |
| `GET /metrics` | Prometheus exposition. Empty body until C08 (`spec/metrics.md`). |
| `GET /cpu?ms=&rounds=` | Hashes sha256 in `rounds`-sized batches until `ms` of wall time is gone. Returns the wall time burned, the rounds done and the final digest. |
| `GET /memory?mb=&hold_ms=` | Allocates and fills `mb` MiB, holds it reachable for `hold_ms`, releases and answers. |

Parameter defaults and bounds are `spec/parameters.md`; the querystring JSON schemas in
`src/app.ts` are that table, and an out-of-range or non-numeric value is a `400`.

Knobs honoured: `PORT` (`8080`), `LOG_LEVEL` (`info`), `GRACEFUL_SHUTDOWN_MS` (`10000`).

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
