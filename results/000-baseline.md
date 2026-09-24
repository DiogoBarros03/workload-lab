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
