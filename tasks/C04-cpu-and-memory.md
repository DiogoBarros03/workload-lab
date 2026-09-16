# C04 · /cpu and /memory

Wave 1 — first vertical slice (Node only)

Owner: `services/api-node` · Needs: C03

Build: `/cpu?ms=&rounds=` (hash rounds), `/memory?mb=&hold_ms=`.

Accept when:
- [ ] contract tests pass
- [ ] `results/001-node-event-loop.md`: with `/cpu?ms=200` under load, concurrent
      `/healthz` p99 is measured and the blocking is explained in ≤5 lines
