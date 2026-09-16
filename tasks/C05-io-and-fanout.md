# C05 · /io and /fanout

Wave 1 — first vertical slice (Node only)

Owner: `services/api-node` · Needs: C03, C02

Build: `/io?ms=&jitter=` calls the sim once. `/fanout?n=&mode=parallel|serial` calls it
n times. `DOWNSTREAM_TIMEOUT_MS` honoured → 504.

Accept when:
- [ ] contract tests pass
- [ ] timeout returns 504 within `timeout + 50 ms`
- [ ] `results/002-tail-latency.md`: fanout n=10 parallel p99 vs single-call p99, same profile
