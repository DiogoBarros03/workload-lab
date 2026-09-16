# C12 · Queue + worker-node (v2)

Wave 3 — variants

Owner: `services/worker-node` + api changes · Needs: C11, C08

Build: `WORK=queue` → 202 + id, `GET /jobs/:id`. Worker with `BATCH_SIZE`, `CONCURRENCY`,
retry with backoff, DLQ. `QUEUE=memory|redis`; job state lives in the queue backend (ADR 0007).
Emit `queue_depth`, `queue_lag_seconds`, `jobs_processed_total{outcome}`.

Accept when:
- [ ] `spike` profile: API p99 stays under the `constant` p99 while `queue_depth` grows, then drains
- [ ] kill the worker mid-batch with `QUEUE=redis`: no job lost; duplicates counted and recorded
- [ ] same test with `QUEUE=memory`: loss recorded — this is the point
- [ ] a poison job lands in the DLQ after `RETRY_MAX`
