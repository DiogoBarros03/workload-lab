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
| `PUT /outage` | `{"duration_ms": N}` — fail every call for `N` ms, then recover. `0` ends an outage now. |
| `GET /stats` | Call counters. |
| `DELETE /stats` | Reset the counters to zero. |
| `GET /healthz` | Liveness. |

### Workload config

Set with `PUT /config`. These change mid-experiment without a restart — that is the point of
them being config rather than environment.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `latency_ms` | integer ≥ 0 | `0` | Base latency before responding. |
| `jitter_ms` | integer ≥ 0 | `0` | Spread. Its meaning depends on `latency_shape` — see the two rows below. |
| `latency_shape` | `uniform` \| `lognormal` | `uniform` | `uniform`: the wait is uniform over `latency_ms ± jitter_ms`, floored at 0 — bounded, symmetric, no tail. `lognormal`: median stays `latency_ms`, but the tail is unbounded. |
| `seed` | integer ≥ 0 | `1` | Seeds every draw — latency, error and timeout. `PUT /config` re-seeds, so the same seed replays the same sequence. |
| `error_rate` | 0.0–1.0 | `0` | Probability of a `500` after the latency is paid. |
| `timeout_rate` | 0.0–1.0 | `0` | Probability the request hangs instead of answering. |
| `rate_limit_rps` | integer ≥ 0 | `0` | Token bucket, capacity and refill both `rps`. `0` disables. |

Under `lognormal`, `jitter_ms / latency_ms` is the standard deviation in log space. At
`latency_ms: 100, jitter_ms: 20` that is `σ = 0.2`, so 68 % of draws land in
`[100·e⁻⁰·², 100·e⁰·²]` = `[82, 122]` ms — almost exactly the `[80, 120]` the uniform shape
would give — while the far tail keeps going. Same median, same middle, different tail: that
is what makes the two shapes worth comparing at the same `latency_ms`.

An out-of-range value or an unknown field is a `400`. Unknown *query* parameters are ignored.

### Outage

`error_rate` fails calls *independently* — each one rolls its own dice, so failures arrive
spread out. Real dependencies do not fail that way: they fall over, stay over for a while,
and come back. That is an outage, and it is what a circuit breaker actually reacts to.

```
PUT /outage  {"duration_ms": 3000}   ->  {"active": true, "duration_ms": 3000}
PUT /outage  {"duration_ms": 0}      ->  {"active": false, "duration_ms": 0}
```

For the window, **every** call answers `503 {"error":"outage","remaining_ms":N}` immediately —
no latency, no rate-limit token spent, no error draw. When the window ends the sim serves
normally again without a restart. `stats.outage` counts the burst.

An outage is deliberately not part of the workload config, so a `PUT /config` in the middle of
one does not silently cancel it.

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

## Example 2 — medium: the same median, a much worse tail

A dependency whose latency is uniform over `100 ± 80 ms` and one whose latency is lognormal
around a median of `100 ms` look identical on a dashboard showing p50. They are not the same
dependency at all. Measure both, one after the other, and read the two p99s.

Each arm takes 200 sequential calls — about half a minute:

```bash
sample() {                       # $1 = uniform | lognormal
  curl -s -XPUT 127.0.0.1:8090/config -H 'content-type: application/json' \
       -d "{\"latency_ms\":100,\"jitter_ms\":80,\"latency_shape\":\"$1\",\"seed\":1234}" > /dev/null
  for i in $(seq 1 200); do
    printf '%s\n' "$(curl -s 127.0.0.1:8090/call | sed -n 's/.*"latency_ms":\([0-9]*\).*/\1/p')"
  done | sort -n | sed -n "1p;100p;190p;199p" | paste -sd' ' -
}

echo "shape       min  p50  p95  p99"
echo "uniform    $(sample uniform)"
echo "lognormal  $(sample lognormal)"
```

Both p50s land near `100`. The uniform arm's p99 cannot exceed `180` — that is the whole
range — while the lognormal arm's runs several hundred milliseconds and has no ceiling at all. Add
`"error_rate":0.2` to either config to mix in independent failures; `/stats` then returns
`{calls, ok, error, timeout, rate_limited, outage}`, where `calls` counts **arrivals**, so the
failures are included in it rather than subtracted from it.

## Example 3 — complex: a reproducible run, then take the dependency down

Two things make a failure experiment worth writing up: you can run it again and get the same
numbers, and the failure looks like a real one. Here is both.

**Replay.** The same seed gives the same sequence of draws. `PUT /config` re-seeds, so an arm
is repeatable without restarting anything:

```bash
for run in A B C; do
  seed=7; [ "$run" = C ] && seed=8
  curl -s -XPUT 127.0.0.1:8090/config -H 'content-type: application/json' \
       -d "{\"latency_ms\":100,\"jitter_ms\":80,\"latency_shape\":\"lognormal\",\"seed\":$seed}" > /dev/null
  printf '%s seed=%s: ' "$run" "$seed"
  for i in $(seq 1 5); do
    printf '%s ' "$(curl -s 127.0.0.1:8090/call | sed -n 's/.*"latency_ms":\([0-9]*\).*/\1/p')"
  done; echo
done
```

A and B print the same five numbers. C, one seed away, prints five different ones.

**Outage.** Now break it properly — everything fails for three seconds, then it heals itself:

```bash
curl -s -XPUT 127.0.0.1:8090/config -H 'content-type: application/json' -d '{}' > /dev/null
curl -s -XDELETE 127.0.0.1:8090/stats > /dev/null
curl -s -XPUT 127.0.0.1:8090/outage -H 'content-type: application/json' -d '{"duration_ms":3000}'; echo

end=$(( $(date +%s) + 4 ))
while [ "$(date +%s)" -lt "$end" ]; do
  printf '%s ' "$(curl -s -o /dev/null -w '%{http_code}' 127.0.0.1:8090/call)"
  sleep 0.2
done; echo

curl -s 127.0.0.1:8090/stats
```

About fifteen `503`s, then `200`s again, with no restart in between — and `stats.outage`
equal to the number of `503`s. That burst of consecutive failures is the input a circuit
breaker opens on, and the recovery is what lets it half-open and close again.

**The other hard failure is the one that never answers.** `{"timeout_rate":1}` makes every
call hang for up to 30 s instead of failing, which is how a caller's own deadline gets
exercised:

```bash
curl -s -XPUT 127.0.0.1:8090/config -H 'content-type: application/json' -d '{"timeout_rate":1}'
time curl -s -m 1 127.0.0.1:8090/call ; echo "curl exit $?  (28 = timed out, correct)"

DOWNSTREAM_TIMEOUT_MS=500 npm run api     # separate terminal
curl -s -o /dev/null -w '%{http_code} in %{time_total}s\n' 127.0.0.1:8080/io
```

`504 in 0.502s` — the caller gave up at its own deadline rather than waiting out the hang.
That measurement is `results/002-tail-latency.md`; the script that automates it is
`services/api-node/measure/timeout.mjs`.

---

## Decisions a caller depends on

- **Both latency shapes have their p50 at `latency_ms`.** Uniform jitter is symmetric;
  lognormal is parameterised by its median rather than its mean. A caller comparing medians
  across shapes can trust that number, which is the only reason the comparison is meaningful.
- **`lognormal` is unbounded and deliberately not capped.** A draw of ten times the median is
  rare but reachable, which is the point — `uniform` has a hard ceiling at
  `latency_ms + jitter_ms` and therefore cannot produce a tail at all.
- **Every draw comes from a seeded generator.** No call anywhere in the sim uses unseeded
  randomness, so any arm can be replayed exactly. `PUT /config` re-seeds from `seed`.
- **An outage answers `503` immediately, not slowly.** It is the *correlated, deterministic*
  failure — a fixed window in which every call fails, repeatable to the millisecond, which a
  probabilistic `error_rate` can never be. Failing fast rather than hanging keeps it that way
  and matches how a real dependency behind a load balancer goes down. A *slow* failure is a
  different instrument: that is `timeout_rate`, which hangs.
- **An outage outranks everything else on `/call`** — the rate limiter, the error draw, the
  latency. Nothing is consumed on a call that the outage rejects.
- **`error_rate` and `timeout_rate` are drawn independently and error wins.** Two failure
  injectors that disagreed about precedence would confound any experiment comparing them.
- **A drawn timeout hangs** for up to 30 s rather than answering `504` fast, because a
  downstream that answers instantly never exercises a caller's timeout. The wait is abandoned
  as soon as the caller hangs up.
- **Latency is paid before the outcome is applied.** A `500` costs the caller the same wall
  time as a `200`, which is what makes a retry budget honest.
- **`stats.calls` counts arrivals** — every request that reached `GET /call`, including those
  answered `429`, `500` and `503`. A `429` *is* a call the caller made. The breakdown (`ok`,
  `error`, `timeout`, `rate_limited`, `outage`) is there so nothing is lost. This definition is what makes "the
  circuit breaker stopped calling the downstream" and "the cache prevented a stampede"
  measurable: both mean no request arrived at all.
- **The rate limiter is one global token bucket, not per-caller.** With two clients sharing a
  sim you can see that shedding happened, but not to whom.
