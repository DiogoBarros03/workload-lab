# Local orchestration is Kubernetes YAML, not Compose

This machine runs rootless podman with no working compose provider, and Kubernetes is the
plan's primary target anyway. Local variants are therefore described as Kubernetes YAML in
`deploy/local/` and run with `podman play kube`, so the same description carries forward
into `deploy/k8s/` instead of being thrown away.

## Consequences

There is no compose file anywhere in this repo and there never will be. `deploy/local/`
and `deploy/k8s/base/` describe the same workloads at different fidelity; they will drift
unless C17 builds the kustomize base from what `deploy/local/` already proved.
