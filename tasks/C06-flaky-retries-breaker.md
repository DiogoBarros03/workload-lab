# C06 · /flaky + retries + breaker

Wave 1 — first vertical slice (Node only)

Owner: `services/api-node` · Needs: C05

Build: `/flaky?error_rate=&timeout_rate=`. Knobs `RETRY_MAX`, `RETRY_BACKOFF_MS`
(with jitter), `BREAKER=off|on`.

Accept when:
- [ ] `/io` with sim `error_rate 0.5` and `RETRY_MAX=3` → client-visible error rate < 15 %
- [ ] breaker opens after N consecutive failures on `/io` or `/fanout`; while open, those
      respond 503 in < 5 ms and sim call count does not increase
- [ ] breaker half-opens and recovers when the sim is healthy again
- [ ] `/flaky` stays self-contained — it injects locally, never calls the sim, and is
      deterministic at rate 0 so the contract suite can still test it
