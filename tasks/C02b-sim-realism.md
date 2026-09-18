# C02b · Sim realism

*Inserted 2026-09-17 at the C05 gate. Runs before C06.*

**C02b · Sim realism** *(inserted 2026-09-17, runs before C06)*
Owner: `services/downstream-sim` · Needs: C02
Build: a long-tailed latency shape and correlated failure, because uniform jitter and
independent per-request errors are not what real dependencies do — C05 measured tail
amplification at 1.01x against uniform and had to inject hangs to see the effect at all.
Add `latency_shape: uniform|lognormal` to sim config (uniform stays the default, so every
existing result stays valid) and `PUT /outage {duration_ms}` which fails everything for a
window then recovers. All randomness seeded and reproducible.
Accept when:
- [ ] `latency_shape: lognormal` with the same p50 as uniform produces a materially heavier
      p99 — both measured, in one table
- [ ] the same seed reproduces the same latency sequence; a different seed does not
- [ ] `PUT /outage {duration_ms: 3000}` fails every call for 3 s +/- 100 ms, then recovers
      with no restart, and `/stats` shows the burst
- [ ] uniform is untouched: C02's box (latency 100 / jitter 20 -> p50 within 100 +/- 15 ms)
      still passes unchanged

