# 002 — fanout trades the median for the tail

Hypothesis: `/fanout?n=10&mode=parallel` finishes when its *slowest* of ten downstream calls
finishes, so its latency should be the **max** of ten draws from the sim's distribution rather
than one draw. Against the same sim config, fanout p99 should therefore sit well above
single-call p99, and fanout p50 should land near single-call p99.

Setup: local · v0 (`CACHE=off`, `WORK=sync`) · node · 1 replica · ad-hoc load, autocannon as a
library (ADR 0006), 10 connections, 10 s per arm, 3 s warm-up per arm discarded, 3 runs,
`LOG_LEVEL=warn` · host AMD Ryzen 9 7900 (24 threads), 61 GB, Linux 7.1.9-arch1-2 ·
**generator, api-node and downstream-sim are three processes on the same machine**, all inside
`docker.io/library/node:24` (Node v24.21.0). Sim config
`{latency_ms: 100, jitter_ms: 80, error_rate: 0, rate_limit_rps: 0}` — jitter is symmetric
(`spec/parameters.md`, amended 2026-09-17), so one call is uniform over **[20, 180] ms**.
`rate_limit_rps: 0` disables the sim's token bucket on purpose: parallel fanout multiplies
sim load by `n`, and a 429 storm would measure the limiter instead of the tail (`sim_429` is
reported per arm and is zero everywhere). `DOWNSTREAM_TIMEOUT_MS=10000` in experiment A so no
arm can 504; the timeout budget itself is measured separately (`measure/timeout.mjs`).
One variable per arm: how many sim calls one request makes and whether they overlap.
Command: `bash scripts/container.sh docker.io/library/node:24 node
services/api-node/measure/tail-latency.mjs`. Raw: `results/raw/002-tail-latency.json`.

Numbers (ms; autocannon has no p95 bucket, so p97.5 is reported in its place — same choice
C04 made, open decision #6, so the two files stay comparable):

## A — bounded jitter, no failures (`timeout_rate: 0`)

| run | arm | rps | mean | p50 | p97.5 | p99 | max | non2xx | sim calls |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | `/io?ms=100&jitter=80` | 99.3 | 99.5 | 101 | 174 | **178** | 180 | 0 | 1058 |
| 1 | `/fanout?n=10` parallel | 59.7 | 165.6 | 169 | 179 | **180** | 180 | 0 | 6070 |
| 1 | `/fanout?n=10` serial | 9.4 | 1007.0 | 1004 | 1254 | 1369 | 1369 | 0 | 994 |
| 2 | `/io?ms=100&jitter=80` | 99.3 | 99.8 | 97 | 176 | **178** | 180 | 0 | 1049 |
| 2 | `/fanout?n=10` parallel | 59.7 | 165.7 | 169 | 180 | **180** | 186 | 0 | 6670 |
| 2 | `/fanout?n=10` serial | 9.4 | 1010.5 | 990 | 1302 | 1487 | 1487 | 0 | 999 |
| 3 | `/io?ms=100&jitter=80` | 98.4 | 100.4 | 100 | 177 | **178** | 180 | 0 | 1035 |
| 3 | `/fanout?n=10` parallel | 60.3 | 164.1 | 168 | 180 | **180** | 182 | 0 | 6130 |
| 3 | `/fanout?n=10` serial | 9.5 | 1000.2 | 977 | 1293 | 1394 | 1394 | 0 | 1007 |

**fanout n=10 parallel p99 = 180 ms vs single-call p99 = 178 ms — 1.01×.** The hypothesis is
wrong at the p99 and right everywhere else: p50 goes **99 → 169 ms (1.7×)**, i.e. the fanout's
*median* is the single call's *p97*, and throughput goes 99 → 60 rps at fixed concurrency.
Serial is the contrast: p50 990 ms ≈ 10 × the median, exactly `n` × one call, and it pays
10× the wall time for 1/10 the sim load per second.

## B — same setup plus a 0.5 % hang rate (`timeout_rate: 0.005`, `DOWNSTREAM_TIMEOUT_MS=500`)

A drawn timeout hangs rather than answering fast (`services/downstream-sim/README.md`), so
this is the only unbounded tail the sim can produce. Serial is dropped: 10 × 100 ms median
exceeds a 500 ms deadline by construction.

| run | arm | rps | mean | p50 | p97.5 | p99 | max | non2xx | error % |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | `/io?ms=100&jitter=80` | 96.1 | 103.1 | 100 | 177 | **179** | 501 | 5 | 0.5 |
| 1 | `/fanout?n=10` parallel | 54.2 | 182.1 | 171 | 500 | **500** | 501 | 26 | 4.8 |
| 2 | `/io?ms=100&jitter=80` | 100.0 | 98.7 | 96 | 177 | **179** | 500 | 4 | 0.4 |
| 2 | `/fanout?n=10` parallel | 55.6 | 176.7 | 169 | 500 | **500** | 501 | 20 | 3.6 |
| 3 | `/io?ms=100&jitter=80` | 96.0 | 102.8 | 101 | 177 | **179** | 501 | 7 | 0.7 |
| 3 | `/fanout?n=10` parallel | 53.6 | 184.5 | 169 | 500 | **501** | 501 | 32 | 5.9 |

**fanout p99 = 500 ms vs single-call p99 = 179 ms — 2.8×**, and the p97.5 is already pinned to
the deadline. Client-visible error rate goes **0.5 % → 4.8 %**, which is `1 − 0.995¹⁰ = 4.9 %`
to the decimal: one hang in ten calls fails the whole request.

Saturation: no arm was resource-bound. 24 host threads, three Node processes, memory flat, no
restarts, no queue (v0). `sim_429` zero in every arm, so the token bucket never fired and the
sim answered every arrival. Errors (socket-level) zero everywhere; the only non-2xx are the
504s in experiment B.

What broke: nothing errored in A — and the *hypothesis* is what broke. Uniform jitter has a
hard ceiling at 180 ms, and the single call's own p99 (178 ms) already sits on it, so taking a
max of ten has nowhere left to go. The amplification is real but it lands in the body of the
distribution, not the tail. In B, where the tail is genuinely unbounded, the predicted effect
appears immediately and hits availability harder than latency.

Conclusion (≤5 lines):
A parallel fanout's latency is the max of `n` draws, so it converts the sim's *median* into
the sim's *tail* — p50 99 → 169 ms here — while its p99 can only reach whatever ceiling the
distribution already has. Measure the amplification against the shape of the downstream
distribution, not against `n`: bounded jitter amplifies the median 1.7×, a 0.5 % hang rate
amplifies p99 2.8× and the error rate 10×. Serial is the honest 10× on wall time and no tail
amplification at all, which is why it is the wrong default. C25's hedging attacks exactly case
B; C06's retries are what turn a 4.8 % fanout failure rate back into a survivable one.
