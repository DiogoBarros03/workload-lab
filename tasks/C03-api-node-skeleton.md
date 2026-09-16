# C03 · api-node skeleton

Wave 1 — first vertical slice (Node only)

Owner: `services/api-node` · Needs: C01

Build: Fastify, `/healthz` `/readyz` `/metrics` (empty but well-formed), JSON logs with
request id, graceful shutdown, Containerfile on Node 24 LTS.

Accept when:
- [ ] contract tests for the three endpoints pass
- [ ] SIGTERM during an in-flight request: request completes, new ones refused, exit 0
      within `GRACEFUL_SHUTDOWN_MS`
- [ ] `podman run` of the image serves `/healthz`
