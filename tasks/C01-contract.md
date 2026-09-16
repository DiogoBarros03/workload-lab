# C01 · Contract

Wave 0 — foundation (brain only, sequential)

Owner: `spec/` · Needs: C00

Build: `openapi.yaml`; `metrics.md` (exact names, labels, units — **left empty for now**,
see C08); `knobs.md` (deploy-time env vars); `parameters.md` (per-request query params);
and a contract test suite runnable against any base URL.

Accept when:
- [ ] every endpoint in the table below has ≥1 contract test
- [ ] `npm run contract -- http://localhost:9999` against a 501-stub fails with one line per endpoint
- [ ] knobs and parameters are in separate tables and no value appears in both
- [ ] `/metrics` is specified as existing and returning Prometheus text format; its content
      is explicitly deferred to C08
- [ ] you have reviewed and signed the file (comment at top with date)

Endpoints: `/cpu` `/io` `/fanout` `/flaky` `/memory` `/catalog/:id` `POST /jobs`
`GET /jobs/:id` `/healthz` `/readyz` `/metrics`.
