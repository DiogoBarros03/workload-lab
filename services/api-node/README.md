# api-node

## What this service is for

This is the service under test — the Node implementation of the lab's contract. It does not do
anything useful on purpose. Every endpoint exists to reproduce one specific way a real HTTP
service gets into trouble, on demand and at a scale you choose:

- **`/cpu`** burns the CPU synchronously, so you can watch one expensive request starve every
  other request on a single-threaded runtime.
- **`/memory`** allocates and holds, so you can walk a container into its memory limit.
- **`/io`** and **`/fanout`** call a downstream dependency once, or `n` times, so you can watch
  tail latency amplify when a request is only as fast as the slowest call it waits on.
- **`/healthz`** and **`/readyz`** are the probes an orchestrator uses to decide whether this
  pod is alive and whether to send it traffic — deliberately different answers, because
  confusing the two is its own failure mode.

A second implementation in C# implements the identical contract, so the same measurements can
be run against both runtimes and compared. The code is not the deliverable; the numbers in
`results/` are.

## What you can do with it

`/io` and `/fanout` need a downstream, so start the sim first:

```bash
npm run sim    # 127.0.0.1:8090
npm run api    # 127.0.0.1:8080   (API_PORT picks the host port)
```

Verify it against the contract: `npm run contract -- http://127.0.0.1:8080`. Seven tests pass
today; four fail because those endpoints are not built yet (`/flaky`, `/catalog/:id`, and the
two `/jobs` routes).

### API

| Route | Does |
|---|---|
| `GET /healthz` | Liveness. `200` whenever the process can answer. Never consults a dependency. |
| `GET /readyz` | Readiness. `200` when serving, `503` while starting and from SIGTERM to exit. |
| `GET /metrics` | Prometheus exposition. Empty body until instrumentation lands. |
| `GET /cpu?ms=&rounds=` | Hashes sha256 in `rounds`-sized batches until `ms` of wall time is gone. Returns the time burned, rounds done, and final digest. |
| `GET /memory?mb=&hold_ms=` | Allocates and fills `mb` MiB, holds it reachable for `hold_ms`, then releases and answers. |
| `GET /io?ms=&jitter=` | One downstream call, asking for `ms` ± `jitter` latency. Returns the wall time and `attempts`. |
| `GET /fanout?n=&mode=` | `n` downstream calls, overlapping (`parallel`) or sequential (`serial`). Returns `{n, mode, ok, failed, ms}`. |

An out-of-range or non-numeric parameter is a `400`.

### Workload config

Environment, fixed at start — changing one needs a restart:

| Knob | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Listen port inside the container. |
| `LOG_LEVEL` | `info` | **Set to `warn` for load runs** — two JSON lines per request distorts latency at high RPS. |
| `GRACEFUL_SHUTDOWN_MS` | `10000` | Drain deadline on SIGTERM. |
| `DOWNSTREAM_URL` | `http://127.0.0.1:8090` | Where the sim is. |
| `DOWNSTREAM_TIMEOUT_MS` | `1000` | **Per-request** budget — retries live inside it, not on top of it. |

---

## Example 1 — simple: burn some CPU

```bash
npm run api
curl -s '127.0.0.1:8080/cpu?ms=200'
```

```json
{"ms":200,"rounds":1000,"hash":"a3f1…"}
```

The digest is returned so the work cannot be optimised away. `ms=0` (the default) burns nothing.

## Example 2 — medium: watch one request starve the whole service

This is the finding in `results/001-node-event-loop.md`, reproducible by hand in two terminals.
`/healthz` does no work at all, so anything it reports is pure interference:

```bash
# terminal 1 — probe the service continuously
while true; do curl -s -o /dev/null -w '%{time_total}\n' 127.0.0.1:8080/healthz; done

# terminal 2 — one slow, blocking request
curl -s '127.0.0.1:8080/cpu?ms=2000' >/dev/null
```

Terminal 1 sits at ~0.000s, then stalls for the full two seconds, then resumes. Nothing errored
and nothing timed out — the service stayed "healthy" by every signal a liveness probe can see,
while being completely unusable. Under load this is measured rather than watched:

```bash
bash scripts/container.sh docker.io/library/node:24 node services/api-node/measure/event-loop.mjs
```

## Example 3 — complex: make tail latency amplify

A fanout request finishes when its **slowest** call finishes, so its p99 tracks the tail of the
downstream distribution rather than the median. Configure a downstream with a real tail, then
compare one call against ten:

```bash
# A downstream that is usually fine, and occasionally hangs.
curl -s -XPUT 127.0.0.1:8090/config -H 'content-type: application/json' \
     -d '{"latency_ms":100,"jitter_ms":80,"timeout_rate":0.005}'

DOWNSTREAM_TIMEOUT_MS=500 LOG_LEVEL=warn npm run api    # restart — these are knobs, not parameters

curl -s '127.0.0.1:8080/io?ms=100&jitter=80'
curl -s '127.0.0.1:8080/fanout?n=10&mode=parallel'
curl -s '127.0.0.1:8080/fanout?n=10&mode=serial'
```

Then measure it properly, three runs with warm-up discarded:

```bash
bash scripts/container.sh docker.io/library/node:24 node services/api-node/measure/tail-latency.mjs
```

A 0.5% hang rate on one call becomes a **4.9% failure rate** on a fanout of ten — exactly
`1 − 0.995¹⁰` — and p99 goes from 179 ms to the 500 ms deadline. Meanwhile `serial` mode is a
flat 10× on wall time with no amplification at all, because it never waits on a maximum.
Full numbers and the surprise in the first version of this experiment: `results/002-tail-latency.md`.

---

## Graceful shutdown

On SIGTERM or SIGINT, within `GRACEFUL_SHUTDOWN_MS`, the service:

1. flips to `shutting_down` — `/readyz` answers `503` immediately, so a load balancer stops
   sending before anything is dropped;
2. **keeps the listener open** and keeps answering the three probes, while every other route
   answers `503 {"error":"shutting_down"}`;
3. waits for in-flight requests to finish, then closes and exits `0`.

Exceeding the deadline exits `1` with requests dropped — the honest signal that the drain
failed. Verify it:

```bash
bash scripts/container.sh docker.io/library/node:24 node services/api-node/measure/shutdown.mjs
```

## Decisions a caller depends on

- **The listener stays open during the drain.** Closing it on SIGTERM would make `/readyz`'s
  `503` unobservable, and it is what a Kubernetes `preStop` hook needs: the pod must keep
  answering while the endpoints controller catches up.
- **Refusal is `503`, not a dropped connection.** A keep-alive client gets an answer it can
  count rather than a socket error it has to guess at.
- **`/cpu` blocks on purpose.** It is synchronous so that the event-loop cost is measurable,
  and so that moving it to a worker thread later is a measurable improvement.
- **`/memory` is not capped to `GRACEFUL_SHUTDOWN_MS`.** A `hold_ms` longer than the grace
  period keeps the drain open past its deadline, so SIGTERM exits `1` and the response is
  dropped — measured, not assumed. That is the honest signal, and studying OOMKill needs an
  allocation that can outlive the grace period.
- **`x-request-id` is honoured and echoed.** An incoming header is reused; otherwise a UUID is
  generated. Both come back on the response.
- **One deadline covers a whole request, not each call.** All `n` fanout calls share one
  `AbortSignal`, so a serial `n=10` at 100 ms per call needs a timeout above 1 s or it always
  `504`s. That is the contract, not a bug.
- **`504` means only "the deadline fired".** A downstream non-2xx is a *failed call*:
  `/fanout` reports it in `failed`, and `/io` will answer `502` once retries exist. A
  connection error that never reached the downstream is a `500`, because answering `200` for a
  call that never happened would be a lie in the measurement.
- **`attempts` is always `1` until retries land.** The field exists now so the response shape
  does not change when they do.
