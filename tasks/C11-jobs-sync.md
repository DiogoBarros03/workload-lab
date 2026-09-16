# C11 · Jobs sync (v0 baseline)

Wave 3 — variants

Owner: both APIs · Needs: C09

Build: `POST /jobs` with `WORK=sync` runs the job inline and returns 200 with result.

Accept when:
- [ ] contract tests pass
- [ ] `results/005-sync-jobs.md`: `spike` profile → p99 and error rate recorded
