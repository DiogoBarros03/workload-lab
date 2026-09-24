# 000 · Baseline: one API container, one DB container

**Hypothesis.** A single Fastify + Postgres CRUD service limited to 0.5 CPU / 128 MiB serves
1 and 100 RPS with room to spare, and 1000 RPS is where it starts to hurt.

**Setup.** `compose.yaml` on this commit. k6 `constant-arrival-rate`, 30 s per level, one
iteration = POST, GET, PUT, DELETE on the same row. Host: 24 cores, rootless podman, cgroup v2.
Raw summaries: `results/raw/rps-{1,100,1000,3000}.json` (git-ignored, re-runnable).

**Numbers** (`http_req_duration` in ms, all requests 2xx unless stated).

| Target RPS | Achieved RPS | med | p95 | p99 | max | Dropped iterations | Peak VUs |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1.07 | 5.7 | 14.6 | 15.7 | 16 | 0 | 4 |
| 100 | 100 | 5.5 | 7.9 | 8.9 | 14 | 0 | 25 |
| 1000 | 998 | 10.1 | 19.1 | 26.6 | 54 | 0 | 250 |
| 3000 | 1056 | 4256 | 6292 | 6589 | 6632 | 10675 of 22500 | 6000 |

Container state during the 3000 RPS run, read from the API cgroup afterwards:

| Counter | Value | Meaning |
|---|---:|---|
| `cpu.stat nr_throttled` | 57 periods, 12.1 s total | CPU quota (0.5) was the wall for part of the run |
| `memory.events max` | 7382 | The 128 MiB ceiling was hit repeatedly; reclaim, not kill |
| `memory.events oom_kill` | 0 | Never killed |
| `memory.events sock_throttled` | 7202 | Kernel throttled socket buffers under memory pressure |
| API memory (`podman stats`) | 134.1 / 134.2 MiB | Pinned at the limit |
| DB CPU (`podman stats`) | ~5 % of host | The database was never the bottleneck |

**What broke.** Nothing returned an error. The system failed by *queueing*: at 3000 RPS the
API tops out around 1050 RPS, requests wait ~4 s, and k6 drops a third of its iterations
because no VU is free. Throughput plateaued instead of collapsing because k6 backed off, not
because the service protected itself. p99 at 1 RPS is *worse* than at 100 RPS: cold pool
connections and a cold JIT dominate when there is no steady traffic to keep them warm.

**Conclusion.**
1. Hypothesis wrong on the safe side: 1000 RPS is fine (p99 27 ms); the knee is ~1050 RPS.
2. The first wall is the API container, memory before CPU. The DB is idle.
3. The failure mode is unbounded latency, not errors: nothing sheds load or times out.
4. Next: Ch. 5, replicate the API behind a load balancer and see whether the knee moves
   linearly, and at what point the DB becomes the wall instead.
