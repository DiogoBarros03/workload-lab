# C06 · /flaky + retries + breaker

Wave 1 — first vertical slice (Node only)

Owner: `services/api-node` · Needs: C05

Build: `/flaky?error_rate=&timeout_rate=`. Knobs `RETRY_MAX`, `RETRY_BACKOFF_MS`
(with jitter), `BREAKER=off|on`.

Accept when:
- [ ] sim `error_rate 0.5`, `RETRY_MAX=3` → client-visible error rate < 15 %
- [ ] breaker opens after N consecutive failures; while open, responds 503 in < 5 ms and
      sim call count does not increase
- [ ] breaker half-opens and recovers when sim is healthy again
