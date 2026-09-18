# downstream-sim

## What this service is for

Every service in this lab eventually calls something it does not control — a payment provider,
an internal API, a database behind a connection pool. Those things are slow at unpredictable
times, fail some fraction of the time, hang without answering, and cut you off when you ask too
often. You cannot study how your service behaves against that by pointing it at a real
dependency, because a real dependency will not misbehave on command.

`downstream-sim` is that dependency, made obedient. You tell it exactly how slow to be, how
often to fail, how often to hang, and when to start refusing, and it does precisely that for
as long as you ask. Every latency and error number produced anywhere in this project traces
back to a sim configured on purpose.

It is a **fixture, not a subject**. Nothing here is being measured or optimised — it exists so
that something else can be.

## What you can do with it

Start it — builds the image and runs it. `SIM_PORT` picks the host port, default `8090`:

```bash
npm run sim
```

### API

| Route | Does |
|---|---|
| `GET /call` | The downstream call. Optional `latency_ms` and `jitter_ms` query overrides. |
| `PUT /config` | **Replaces** the workload config. Omitted fields return to their default. Returns the result. |
| `GET /config` | Current workload config. |
| `GET /stats` | Call counters. |
| `DELETE /stats` | Reset the counters to zero. |
| `GET /healthz` | Liveness. |

### Workload config

Set with `PUT /config`. These change mid-experiment without a restart — that is the point of
them being config rather than environment.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `latency_ms` | integer ≥ 0 | `0` | Base latency before responding. |
| `jitter_ms` | integer ≥ 0 | `0` | **Symmetric** spread: the wait is uniform over `latency_ms ± jitter_ms`, floored at 0. |
| `error_rate` | 0.0–1.0 | `0` | Probability of a `500` after the latency is paid. |
| `timeout_rate` | 0.0–1.0 | `0` | Probability the request hangs instead of answering. |
| `rate_limit_rps` | integer ≥ 0 | `0` | Token bucket, capacity and refill both `rps`. `0` disables. |

An out-of-range value or an unknown field is a `400`. Unknown *query* parameters are ignored.

Environment: `PORT` (`8080` inside the container), `LOG_LEVEL` (`info`). Request logging is
deliberately off — two log lines per request would distort the latency this service exists to
control.

---

## Example 1 — simple: make it slow

```bash
npm run sim

curl -s -XPUT 127.0.0.1:8090/config -H 'content-type: application/json' \
     -d '{"latency_ms":250}'

curl -s 127.0.0.1:8090/call -w ' %{time_total}s\n'
```

Roughly `0.25s`, every time. Change `latency_ms` and call again — no restart needed.

## Example 2 — medium: a flaky, jittery dependency

Configure something that looks like a real service on a bad day, drive a thousand requests at
it, and read back what actually happened:

```bash
curl -s -XPUT 127.0.0.1:8090/config -H 'content-type: application/json' \
     -d '{"latency_ms":100,"jitter_ms":80,"error_rate":0.2}'
curl -s -XDELETE 127.0.0.1:8090/stats

for i in $(seq 1 1000); do
  curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:8090/call &
  [ $((i % 50)) -eq 0 ] && wait
done; wait | sort | uniq -c

curl -s 127.0.0.1:8090/stats
```

Expect ~80% `200` and ~20% `500`, and latencies spread evenly over 20–180 ms. `/stats` returns
`{calls, ok, error, timeout, rate_limited}` — note `calls` counts **arrivals**, so the failures
are included in it, not subtracted from it.

## Example 3 — complex: prove a caller's timeout works

The hardest downstream failure to handle is the one that never answers at all. `timeout_rate: 1`
makes every call hang, which is how `api-node`'s `DOWNSTREAM_TIMEOUT_MS` gets exercised:

```bash
curl -s -XPUT 127.0.0.1:8090/config -H 'content-type: application/json' \
     -d '{"timeout_rate":1}'
curl -s -XDELETE 127.0.0.1:8090/stats

# The sim hangs; the caller is the one that must give up.
time curl -s -m 1 127.0.0.1:8090/call ; echo "curl exit $?  (28 = timed out, correct)"

curl -s 127.0.0.1:8090/stats   # timeout: 1 — the sim recorded the hang it caused
```

Now the same thing through the service that has a deadline:

```bash
DOWNSTREAM_TIMEOUT_MS=500 npm run api     # separate terminal
curl -s -o /dev/null -w '%{http_code} in %{time_total}s\n' 127.0.0.1:8080/io
```

`504 in 0.502s` — the caller gave up at its own deadline rather than waiting out a hang.
That measurement is `results/002-tail-latency.md`; the script that automates it is
`services/api-node/measure/timeout.mjs`.

---

## Decisions a caller depends on

- **Jitter is symmetric**, so the p50 of a jittered latency is still `latency_ms`. A caller
  comparing medians can trust that number.
- **`error_rate` and `timeout_rate` are drawn independently and error wins.** Two failure
  injectors that disagreed about precedence would confound any experiment comparing them.
- **A drawn timeout hangs** for up to 30 s rather than answering `504` fast, because a
  downstream that answers instantly never exercises a caller's timeout. The wait is abandoned
  as soon as the caller hangs up.
- **Latency is paid before the outcome is applied.** A `500` costs the caller the same wall
  time as a `200`, which is what makes a retry budget honest.
- **`stats.calls` counts arrivals** — every request that reached `GET /call`, including those
  answered `429` and `500`. A `429` *is* a call the caller made. The breakdown (`ok`, `error`,
  `timeout`, `rate_limited`) is there so nothing is lost. This definition is what makes "the
  circuit breaker stopped calling the downstream" and "the cache prevented a stampede"
  measurable: both mean no request arrived at all.
- **The rate limiter is one global token bucket, not per-caller.** With two clients sharing a
  sim you can see that shedding happened, but not to whom.
