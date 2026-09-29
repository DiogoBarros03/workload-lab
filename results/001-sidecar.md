# 001-sidecar · A stats sidecar in the api pod

**Setup.** `deploy/k8s/overlays/001-sidecar`: 000-k8s plus a `stats-sidecar` container (0.1 CPU / 64 MiB) in the api pod, sharing its process namespace and reading the api from `/proc` on NodePort 31001; loadgen target `k8s-sidecar`. Both observers sampled every 2 s: the api's cgroup `/stats` (31000) and the sidecar's `/stats` (31001). Peak CPU (cgroup), throttled, memory and pool waiting come from the cgroup; Peak CPU (sidecar) from the sidecar counters. The sidecar container restarted 0 times. Raw: `results/raw/001-sidecar-open-<op>-<rps>.json` (git-ignored), first-pass read 5000 and write 1000 in `results/raw/001-sidecar-pass1-open-*.json`; machine-readable: `results/001-sidecar.json`.

**Protocol.** loadgen open model, 20 s per run, in-flight cap 10 000; reset and 5 s idle before each run; `/status?target=` and the raw `/stats` sampled every 2 s from t = 4 s. Peak CPU and commits/s come from consecutive raw counter samples; throttled = api `nr_throttled` added during the run, up to the last sample before a kill. Latency in ms. Each run starts on an api pod with 0 restarts (a pod left in CrashLoopBackOff by the previous kill is replaced with `rollout restart`) and only after 20 clean rounds of 5 `/health` probes through NodePort 31000: after an OOM kill the NodePort reset connections for up to ~100 s while the pod was Ready. Restarts = api container `restartCount` after the run (all OOMKilled, exit 137). Achieved rps counts every completed request, errors included; errors carry no HTTP status.

**Cause rules** (the baseline's, written out): api restarted during the run → *memory ceiling*, failed; else peak memory ≥ 127 MiB with drops or errors → *memory ceiling*, failed; else drops or errors → *saturated*, failed; else achieved < 95 % of target → *saturated*, degraded; else *comfortable*, ok. *Saturated* names the CPU when peak CPU ≥ 0.45 cores, else the pool when ≥ 100 wait. `n/a` = not measured (no two consecutive api stats samples got through while the api was being killed).

## Open-model runs (loadgen, 2026-09-29)

**read**

| Target | Achieved | p50 | p99 | Dropped | Errors | Max in flight | Peak CPU (cgroup) | Peak CPU (sidecar) | Throttled | Peak mem MiB | Peak pool waiting | Restarts | Cause |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 100 | 100 | 0.6 | 1.1 | 0 | 0 | 2 | 0.03 | 0.02 | 1 | 45.6 | 0 | 0 | comfortable: p99 1.1 ms |
| 1000 | 999.5 | 1 | 2 | 0 | 0 | 25 | 0.17 | 0.09 | 2 | 54 | 0 | 0 | comfortable: p99 2 ms |
| 2000 | 1998.7 | 1.5 | 7.2 | 0 | 0 | 58 | 0.16 | 0.14 | 0 | 52.2 | 1 | 0 | comfortable: p99 7.2 ms |
| 3000 | 2998.7 | 2.3 | 9 | 0 | 0 | 163 | 0.26 | 0.23 | 0 | 49.5 | 7 | 0 | comfortable: p99 9 ms |
| 5000 | 4614.1 | 4 | 2166 | 0 | 0 | 5175 | 0.5 | 0.37 | 75 | 125.7 | 1636 | 0 | saturated: cpu 0.5 of 0.5 cores, 75 throttled periods |

**write**

| Target | Achieved | p50 | p99 | Dropped | Errors | Max in flight | Peak CPU (cgroup) | Peak CPU (sidecar) | Throttled | Peak mem MiB | Peak pool waiting | Restarts | Cause |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 100 | 99.9 | 6.3 | 14.6 | 0 | 0 | 4 | 0.03 | 0.03 | 0 | 87.7 | 0 | 0 | comfortable: p99 14.6 ms |
| 1000 | 966.5 | 1788 | 4218.9 | 0 | 5402 | 4227 | 0.26 | 0.16 | 8 | 127.6 | 4140 | 1 | memory ceiling: api OOM-killed 1x at the 128 MiB limit (exit 137), down mid-run; peak sampled 127.6 MiB; 5402 errors |
| 2000 | 1977.6 | 187.4 | 2367.1 | 0 | 33899 | 4567 | 0.4 | 0.26 | 12 | 127.1 | 4227 | 2 | memory ceiling: api OOM-killed 2x at the 128 MiB limit (exit 137), down mid-run; peak sampled 127.1 MiB; 33899 errors; 6 of 9 api stats samples failed through the NodePort |
| 3000 | 2734.9 | 187.7 | 1677 | 0 | 55894 | 4644 | 0.12 | 0.2 | 10 | 72.7 | 853 | 2 | memory ceiling: api OOM-killed 2x at the 128 MiB limit (exit 137), down mid-run; peak sampled 72.7 MiB; 55894 errors; 7 of 10 api stats samples failed through the NodePort |
| 5000 | 3187.4 | 2422.1 | 4197.9 | 25468 | 72679 | 10000 | n/a | 0.15 | 4 | 65.8 | 283 | 2 | memory ceiling: api OOM-killed 2x at the 128 MiB limit (exit 137), down mid-run; peak sampled 65.8 MiB; loadgen dropped 25468; 72679 errors; 8 of 10 api stats samples failed through the NodePort |

**mixed** (50/50 read/write)

| Target | Achieved | p50 | p99 | Dropped | Errors | Max in flight | Peak CPU (cgroup) | Peak CPU (sidecar) | Throttled | Peak mem MiB | Peak pool waiting | Restarts | Cause |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1000 | 999 | 5.7 | 21.9 | 0 | 0 | 33 | 0.18 | 0.11 | 1 | 53.4 | 0 | 0 | comfortable: p99 21.9 ms |
| 3000 | 2863.4 | 187.5 | 1611.1 | 0 | 49283 | 4552 | n/a | 0.29 | 20 | 121.8 | 3707 | 2 | memory ceiling: api OOM-killed 2x at the 128 MiB limit (exit 137), down mid-run; peak sampled 121.8 MiB; 49283 errors; 7 of 9 api stats samples failed through the NodePort |

**What limits what**

1. Reads keep up to 3000 rps with p99 9.0 ms, as on 000-k8s (p99 9.1 ms): the sidecar costs nothing measurable at these rates.
2. Read 5000 degraded in the recorded pass (4614.1 rps, p99 2166.0 ms, cgroup 0.5 cores, 75 throttled periods) and held in a first pass (4995.9 rps, p99 29.4 ms), so 5000 is the edge here too.
3. Write 1000 is on the memory edge: the recorded pass was OOM-killed once (966.5 rps, 5402 errors, 127.6 MiB, 4140 waiting); a first pass degraded without a kill (892.4 rps, p99 2390.6 ms). Write 2000, 3000, 5000 and mixed 3000 are OOM-killed twice each, as on 000-k8s.
4. The sidecar sees less CPU than the cgroup: 0.09 vs 0.17 cores at read 1000, 0.23 vs 0.26 at read 3000, 0.37 vs 0.5 at read 5000. It reports memory 109.7 MiB against the cgroup's 54.0 MiB at read 1000.
5. Throttling is invisible to the sidecar (nrThrottled null in every sample) while the cgroup counted 75 throttled periods at read 5000; pool waiting is also only visible from the api's own /stats.

**Sidecar vs cgroup**

- Read 1000: sidecar 0.09 cores, cgroup 0.17 cores.
- Read 3000: sidecar 0.23 cores, cgroup 0.26 cores.
- Read 5000: sidecar 0.37 cores while the cgroup sat at its 0.5-core quota.
- Throttling is invisible to the sidecar: `nrThrottled` is null in every sample, while the cgroup counted 75 throttled periods at read 5000.
- Memory disagrees too: sidecar 109.7 MiB vs cgroup 54.0 MiB at read 1000, sidecar 160.7 MiB (above the 128 MiB limit) vs 125.7 MiB at read 5000.

**Cost of the sidecar.** Read 1000: 999.5 rps, p99 2.0 ms vs 999.4 rps, p99 3.9 ms on 000-k8s; read 3000: 2998.7 rps, p99 9.0 ms vs 2997.3 rps, p99 9.1 ms. No measurable cost at these rates.
