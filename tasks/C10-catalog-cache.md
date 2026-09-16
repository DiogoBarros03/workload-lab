# C10 · Catalog + cache (v1)

Wave 3 — variants

Owner: `services/api-node`, `services/api-dotnet` · Needs: C09

Build: `/catalog/:id` reads from the sim. `CACHE=redis` → cache-aside with TTL.

Accept when:
- [ ] `results/004-cache.md`: p95 warm vs off; 200 concurrent cold-key requests → number of
      sim calls recorded (this is the stampede baseline; fixing it is C24)
