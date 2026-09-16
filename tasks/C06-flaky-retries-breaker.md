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

## Open question — raised at the C01 gate, not yet ruled on

`spec/openapi.yaml` defines `/flaky` as injecting failure **in the api itself**, with the
downstream sim not involved. The three acceptance boxes above all reference the sim
(`sim error_rate 0.5`, `sim call count does not increase`). Both cannot be true.

Proposed, pending the brain's ruling: `/flaky` stays self-contained — that is what makes it
deterministic at rate 0 and therefore contract-testable — and the retry/breaker acceptance
moves to `/io` and `/fanout`, which do call the sim. A breaker around a local failure
injector protects nothing.
