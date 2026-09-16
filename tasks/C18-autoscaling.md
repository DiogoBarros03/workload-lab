# C18 · Autoscaling

Wave 4 — Kubernetes (primary target)

> **Blocked on hardware.** Talos is not installed. The pipeline stops here and waits;
> no substitute distribution is used (ADR 0002).

Owner: `deploy/k8s` · Needs: C17

Build: HPA on CPU for APIs; HPA on `queue_depth` for workers (KEDA or prometheus-adapter).

Accept when:
- [ ] `spike` → worker replicas scale up on queue depth and back down after drain
- [ ] `results/009-hpa.md`: `/io` under load does not trigger CPU-based HPA while p99 degrades
