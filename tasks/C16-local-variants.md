# C16 · Local variants

Wave 3 — variants

Owner: `deploy/local` · Needs: C08, C15

Build: kube YAML per variant, run by `podman play kube`.

Accept when:
- [ ] `npm run up -- v0` … `v3` each bring up the right set of workloads
- [ ] `npm run load -- spike` runs against any of them without changes
- [ ] the YAML is shaped so C17's kustomize base can be derived from it, not rewritten
