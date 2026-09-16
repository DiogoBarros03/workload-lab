# C15 · Cache + queue (v3)

Wave 3 — variants

Owner: both APIs · Needs: C10, C12

Build: both flags on. Job completion invalidates the catalog cache.

Accept when:
- [ ] `results/007-v3-staleness.md`: measured window during which `/catalog` returns stale
      data after a job completes, and whether v3 beat v2 on the `spike` profile
