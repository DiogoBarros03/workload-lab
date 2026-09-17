# downstream-sim

Stands in for an unreliable third party (`CONTEXT.md` — *downstream sim*). Its runtime
settings are **sim config**, not knobs and not parameters: they change mid-experiment via
`PUT /config` without a restart.

Run it: `npm run sim` (builds the image and runs it; `SIM_PORT` picks the host port,
default `8090`).

## Endpoints

| Route | Does |
|---|---|
| `GET /call` | The downstream call. Optional `latency_ms` and `jitter_ms` query overrides. |
| `PUT /config` | **Replaces** sim config. Omitted fields go back to their default. Returns the result. |
| `GET /config` | Current sim config. |
| `GET /stats` | Call counters. |
| `DELETE /stats` | Reset the counters to zero. |
| `GET /healthz` | Liveness. |

Knobs honoured: `PORT` (default `8080`), `LOG_LEVEL` (default `info`).
`GRACEFUL_SHUTDOWN_MS` is not implemented — the sim is a test fixture, not a measured
service.

## Sim config

| Field | Type | Default | Meaning |
|---|---|---|---|
| `latency_ms` | integer ≥ 0 | `0` | Base latency before responding. |
| `jitter_ms` | integer ≥ 0 | `0` | **Symmetric** spread: the wait is uniform over `latency_ms ± jitter_ms`, floored at 0. |
| `error_rate` | 0.0–1.0 | `0` | Probability of a `500` after the latency is paid. |
| `timeout_rate` | 0.0–1.0 | `0` | Probability the request hangs instead of answering. |
| `rate_limit_rps` | integer ≥ 0 | `0` | Token bucket, capacity and refill both `rps`. `0` disables. |

An out-of-range value or an unknown field is a `400`. Unknown *query* parameters are
ignored, matching `spec/parameters.md`.

## Decisions a caller depends on

- **Jitter is symmetric**, so p50 of a jittered latency is still `latency_ms`. The
  acceptance box (p50 within 100 ± 15 at `latency 100 / jitter 20`) only reads cleanly this
  way.
- **`error_rate` and `timeout_rate` are drawn independently and error wins**, the same rule
  `spec/openapi.yaml` gives the api's own `/flaky`. Two failure injectors that disagree
  about precedence would confound any experiment that compares them.
- **A drawn timeout hangs** for up to 30 s rather than answering `504` fast, because a
  downstream that answers instantly does not exercise `DOWNSTREAM_TIMEOUT_MS` (C05). The
  wait is abandoned as soon as the caller hangs up.
- **Latency is paid before the outcome is applied.** A `500` costs the caller the same wall
  time as a `200`, which is what makes retry budgets in C06 honest.
- **`stats.calls` counts arrivals** — every request that reached `GET /call`, including the
  ones answered `429` and the ones answered `500`. A `429` *is* a call the caller made. The
  breakdown (`ok`, `error`, `timeout`, `rate_limited`) is there so nothing is lost. C06's
  "sim call count does not increase" and C10's cold-key stampede count both want arrivals:
  an open breaker or a cache hit means no request was sent at all.
