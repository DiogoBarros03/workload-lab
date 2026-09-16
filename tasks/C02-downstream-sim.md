# C02 · downstream-sim

Wave 1 — first vertical slice (Node only)

Owner: `services/downstream-sim` · Needs: C01

Build: Node service. `GET /call` returns after configured latency. `PUT /config` sets sim
config: `latency_ms, jitter_ms, error_rate, timeout_rate, rate_limit_rps`. Counts calls.

Accept when:
- [ ] latency 100 / jitter 20 → 1000 requests give p50 within 100 ± 15 ms
- [ ] `error_rate: 0.2` → 15–25 % of responses are 5xx
- [ ] above `rate_limit_rps` returns 429
- [ ] `GET /stats` reports total calls; reset via `DELETE /stats`
