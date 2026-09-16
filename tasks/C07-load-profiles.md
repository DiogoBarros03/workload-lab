# C07 · Load profiles

Wave 1 — first vertical slice (Node only)

Owner: `loadtest/` · Needs: C01

Build: `constant`, `ramp`, `spike`, `soak` as autocannon-driven scripts.
`npm run load -- <profile> <url>`.

Accept when:
- [ ] each profile runs against api-node and writes a JSON summary to `results/raw/`
- [ ] every profile is parameterised by environment only — no editing scripts between runs
- [ ] `profiles.md` states RPS, duration, and thresholds for each
