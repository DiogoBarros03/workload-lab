# Knobs

A **knob** is a deploy-time environment variable. Changing one requires a restart, and the
set of knob values is what defines a variant (`CONTEXT.md`).

Per-request query parameters are in [`parameters.md`](./parameters.md) and never appear
here. The downstream sim's runtime settings are **sim config**, set via `PUT /config`, and
belong in neither table.

## Table

| Knob | Values | Default | Applies to | First needed |
|---|---|---|---|---|
| `PORT` | integer | `8080` | every service | C02 |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` | `info` | every service | C03 |
| `GRACEFUL_SHUTDOWN_MS` | integer | `10000` | every service | C03 |
| `DOWNSTREAM_URL` | URL | — | api, worker | C05 |
| `DOWNSTREAM_TIMEOUT_MS` | integer | `1000` | api, worker | C05 |
| `RETRY_MAX` | integer, `0` disables | `0` | api, worker | C06 |
| `RETRY_BACKOFF_MS` | integer, base for jittered backoff | `50` | api, worker | C06 |
| `BREAKER` | `off` \| `on` | `off` | api, worker | C06 |
| `BREAKER_FAILURE_THRESHOLD` | integer, consecutive failures before opening | `5` | api, worker | C06 |
| `BREAKER_RESET_MS` | integer, time open before half-open | `5000` | api, worker | C06 |
| `CACHE` | `off` \| `redis` | `off` | api | C10 |
| `CACHE_TTL_MS` | integer | `30000` | api | C10 |
| `REDIS_URL` | URL | — | api, worker | C10 |
| `WORK` | `sync` \| `queue` | `sync` | api | C11 |
| `QUEUE` | `memory` \| `redis` \| `rabbitmq` | `memory` | api, worker | C12 |
| `RABBITMQ_URL` | URL | — | api, worker | C14 |
| `BATCH_SIZE` | integer | `1` | worker | C12 |
| `CONCURRENCY` | integer | `1` | worker | C12 |
| `SHED_QUEUE_LIMIT` | integer, `0` disables | `0` | api | C26 |

Wave 6 challenges add their own rows here when they add a knob.

## Variant is derived, not configured

There is no `VARIANT` knob. A variant is what a set of knob values *is*, so services compute
the `variant` metric label from `CACHE` and `WORK`:

| `CACHE` | `WORK` | variant |
|---|---|---|
| `off` | `sync` | `v0` |
| `redis` | `sync` | `v1` |
| `off` | `queue` | `v2` |
| `redis` | `queue` | `v3` |

The `impl` label is likewise not a knob — a service knows which impl it is.

## Proving the two tables are disjoint

Names are read from the first column of the `## Table` section of each file. Empty output
means the two sets are disjoint.

    names() { awk '/^## Table/{t=1;next} /^## /{t=0} t' "$1" |
              sed -n 's/^| `\([A-Za-z_0-9]*\)`.*/\1/p' | sort -u; }
    comm -12 <(names spec/knobs.md) <(names spec/parameters.md)

## Retry budget

`DOWNSTREAM_TIMEOUT_MS` is a **per-request** budget, not per attempt. `RETRY_MAX` retries
happen inside it, so a retrying request is bounded by the same deadline as a single one and
retries may be cut short. Ruled 2026-09-17 at the C05 gate.
