# 000 · Baseline: one API container, one DB container

**Hypothesis.** A single Fastify + Postgres bookstore API limited to 0.5 CPU / 128 MiB serves
1 and 100 RPS with room to spare, and 1000 RPS is where it starts to hurt.

**Setup.** `compose.yaml` on this commit. k6 `constant-arrival-rate`, 30 s per level. One
iteration = create author, create book, read book, update book, list the author's books,
delete the author (cascade), so 6 requests, 4 of them writes. Host: 24 cores, rootless
podman, cgroup v2. Raw summaries: `results/raw/rps-{1,100,1000,3000}.json` (git-ignored).

**Numbers** (`http_req_duration` in ms, 0 failed requests at every level).

| Target RPS | Achieved RPS | med | p95 | p99 | max | Dropped iterations | Peak VUs |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 6.3 | 12.6 | 21.9 | 25 | 0 | 4 |
| 100 | 100 | 5.0 | 7.5 | 8.2 | 15 | 0 | 25 |
| 1000 | 999 | 9.7 | 12.9 | 14.2 | 33 | 0 | 250 |
| 3000 | 1253 | 2565 | 5748 | 8533 | 9004 | 5215 of 15000 | 5954 |

API cgroup counters accumulated during the 3000 RPS run alone:

| Counter | Value | Meaning |
|---|---:|---|
| `cpu.stat nr_throttled` | 68 periods, 13.4 s total | The 0.5 CPU quota was the wall for almost half the run |
| `memory.events max` | 6804 | The 128 MiB ceiling was hit repeatedly; reclaim, not kill |
| `memory.events oom_kill` | 0 | Never killed |
| `memory.events sock_throttled` | 9995 | Kernel throttled socket buffers under memory pressure |
| DB CPU (`podman stats`) | ~12 % of host, of a 1-core limit | The database had headroom throughout |

**What broke.** Nothing returned an error. The system failed by *queueing*: at 3000 RPS the
API tops out around 1250 RPS, median latency is 2.5 s, and k6 drops a third of its iterations
because no VU is free. Throughput plateaued instead of collapsing because k6 backed off, not
because the service protected itself. p99 at 1 RPS is *worse* than at 100 RPS: cold pool
connections and a cold JIT dominate when there is no steady traffic to keep them warm.

Two bugs the load test found before it measured anything, both fixed on this commit:
the error handler turned Fastify's own 4xx errors into 500s, and the k6 script generated
14-digit ISBNs above 999 VUs. A load test that reports failures is reporting *something*;
read the failing check before trusting the latency.

**Conclusion.**
1. Hypothesis wrong on the safe side: 1000 RPS is fine (p99 14 ms); the knee is ~1250 RPS.
2. The first wall is the API container, CPU and memory together. The DB is idle.
3. The failure mode is unbounded latency, not errors: nothing sheds load or times out.
4. Next: Ch. 5, replicate the API behind a load balancer and see whether the knee moves
   linearly, and at what point the DB becomes the wall instead.

## Open-model runs (loadgen, 2026-09-25)

**Setup.** api 0.5 CPU / 128 MiB, pg pool 10; db 1 CPU / 256 MiB; loadgen open model, 20 s per run, in-flight cap 10 000; reset and 5 s idle before each run; `/status` and `/stats` sampled every 2 s from t = 4 s. Peak CPU and commits/s come from the raw `/stats` counters across those samples. Throttled = api `nr_throttled` added during the run (for OOM-killed runs, up to the last sample before the kill). Latency in ms. Raw: `results/raw/000-open-<op>-<rps>.json` (git-ignored); machine-readable: `results/000-baseline.json`.

**read**

| Target | Achieved | p50 | p99 | Dropped | Max in flight | Peak CPU | Throttled | Peak pool waiting | Cause |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 100 | 100.0 | 0.6 | 1.0 | 0 | 2 | 0.04 | 0 | 0 | comfortable: p99 1.0 ms |
| 1000 | 999.7 | 1.0 | 2.6 | 0 | 23 | 0.12 | 0 | 0 | comfortable: p99 2.6 ms |
| 2000 | 1998.7 | 1.5 | 9.6 | 0 | 96 | 0.19 | 0 | 8 | comfortable: p99 9.6 ms |
| 3000 | 2998.9 | 2.1 | 15.1 | 0 | 221 | 0.26 | 0 | 10 | comfortable: p99 15.1 ms |
| 5000 | 3731.1 | 118.5 | 10000.8 | 9051 | 10000 | 0.5 | 166 | 3418 | memory ceiling: 128.0 MiB of 128; loadgen dropped 9051; 2874 errors |

**write**

| Target | Achieved | p50 | p99 | Dropped | Max in flight | Peak CPU | Throttled | Peak pool waiting | Cause |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 100 | 99.9 | 6.3 | 12.0 | 0 | 12 | 0.05 | 2 | 0 | comfortable: p99 12.0 ms |
| 1000 | 808.4 | 1824.5 | 4719.8 | 0 | 4087 | 0.37 | 39 | 3865 | saturated: pg pool full, 3865 waiting |
| 2000 | 984.0 | 9545.2 | 12355.7 | 10352 | 10000 | 0.51 | 86 | 9980 | memory ceiling: 127.9 MiB of 128; loadgen dropped 10352; 24437 errors; api OOM-killed (exit 137), down mid-run |
| 3000 | 799.8 | 10044.5 | 14846.1 | 33054 | 10000 | 0.51 | 87 | 9769 | memory ceiling: 128.0 MiB of 128; loadgen dropped 33054; 23567 errors; api OOM-killed (exit 137), down mid-run |
| 5000 | 863.4 | 10000.5 | 12735.9 | 74153 | 10000 | 0.51 | 86 | 9906 | memory ceiling: 127.9 MiB of 128; loadgen dropped 74153; 23725 errors; api OOM-killed (exit 137), down mid-run |

**mixed** (50/50 read/write)

| Target | Achieved | p50 | p99 | Dropped | Max in flight | Peak CPU | Throttled | Peak pool waiting | Cause |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1000 | 999.2 | 6.0 | 41.5 | 0 | 75 | 0.23 | 7 | 0 | comfortable: p99 41.5 ms |
| 3000 | 1139.3 | 9076.5 | 10340.0 | 29318 | 10000 | 0.5 | 99 | 9980 | memory ceiling: 128.0 MiB of 128; loadgen dropped 29318; 20729 errors; api OOM-killed (exit 137), down mid-run |

**What limits what**

1. Reads are bounded by the api container. Up to 3000 rps they keep up with p99 15.1 ms at 0.26 cores and 0 throttled periods; at 5000 the api sits at its 0.5-core quota (166 throttled periods) and 128.0 MiB, achieving 3731 rps.
2. The read knee is between 3000 and 5000 rps; the pool is not the limit for reads (10 waiting at 3000 rps).
3. Writes are bounded by the pg pool of 10. At 1000 rps the api reaches 808 rps with 3865 requests waiting for a connection, while CPU is at 0.37 cores, below the quota.
4. The write knee is between 100 rps (p99 12.0 ms) and 1000 rps (p99 4719.8 ms), at about 800 rps, which is 10 connections at about 12 ms per insert.
5. Past the write knee, queued requests fill the 128 MiB limit and the kernel OOM-kills the api (exit 137): write 2000, 3000, 5000 and mixed 3000, each with 20 729 to 24 437 errors and 10 000 in flight. Mixed 1000 is fine (p99 41.5 ms).
6. At 5000 rps, reads degrade (3731 rps achieved, 9051 dropped, 2874 errors) but the api survives. Writes kill the api: 863 rps achieved, 74 153 dropped.
