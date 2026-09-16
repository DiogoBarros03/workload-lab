# C08 · Observability

Wave 3 — variants *(moved here from Wave 1 — the first thing that needs it is C12)*

Owner: `observability/`, `spec/metrics.md` · Needs: C11

Build: fill in `spec/metrics.md` with exact names, labels and units; instrument both impls;
Prometheus scrape config; Grafana provisioned as code; one dashboard.

Accept when:
- [ ] `spec/metrics.md` is exhaustive — an impl exposing an unlisted metric fails the suite
- [ ] metric name set from `/metrics` is identical across impls (diff is empty) — the C09
      open item, closed here
- [ ] labels `impl=node|dotnet` and `variant=v0|v1|v2|v3` are on every metric
- [ ] dashboard shows p50/p95/p99, error rate, inflight, split by `impl` and `variant`
- [ ] zero manual clicks: `npm run up -- v0` brings it up with the dashboard already loaded
- [ ] a `constant` run is visible on it end to end
