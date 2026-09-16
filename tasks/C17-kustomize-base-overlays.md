# C17 · Kustomize base + overlays

Wave 4 — Kubernetes (primary target)

> **Blocked on hardware.** Talos is not installed. The pipeline stops here and waits;
> no substitute distribution is used (ADR 0002).

Owner: `deploy/k8s` · Needs: C16, a live Talos cluster

Build: base with Deployment, Service, probes, requests/limits, PDB, `preStop`; overlays
v0–v3; infra (in-cluster registry, redis, rabbitmq, prometheus, grafana); Talos machine
config including the `registries.mirrors` entry for the in-cluster registry (ADR 0003).

Accept when:
- [ ] `npm run k8s -- v2` → all pods Ready, `npm run contract` green through port-forward
- [ ] images are pulled from the in-cluster registry, not side-loaded
- [ ] rollout during `constant` load: 5xx count recorded in `results/008-rollout.md`
- [ ] removing `preStop` and repeating shows a higher 5xx count (proves it works)
