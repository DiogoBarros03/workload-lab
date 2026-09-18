# Open decisions

Raised at a gate, not yet ruled on by the brain. Each says what breaks if it stays open.
Close one by making the edit and deleting its section.

## 1. `openapi.yaml` is unsigned

C01's fifth acceptance box reserves a line for the brain's review and date. It is still blank
and no agent may fill it. C01 merged with this box unticked.
**Blocks:** nothing mechanically. It is the only box in the project a human must tick.

---

## Closed

- **#5 type-checking** — ruled and done 2026-09-17: root `tsconfig.json` (strict,
  `erasableSyntaxOnly` to match Node 24 type stripping), `@types/node`, `npm run typecheck`
  in `npm run ci` and in the CI node job.

- **#2 `/flaky` vs C06** — ruled 2026-09-17: `/flaky` stays self-contained; C06's retry and
  breaker acceptance moved to `/io` and `/fanout`. Applied to `PLAN.md` and `tasks/C06-*`.
- **#3 jitter** — closed 2026-09-17: `spec/parameters.md` amended to symmetric, matching the
  merged sim.
- **#4 `/catalog` owner** — ruled 2026-09-17: the api synthesises the item body and calls
  `GET /call` for the downstream cost. Applied to `spec/openapi.yaml`; no sim change needed.
- **#6 percentiles** — ruled 2026-09-17: results template is now `p50 / p97.5 / p99`, which is
  what autocannon measures. C04's result already matches.
