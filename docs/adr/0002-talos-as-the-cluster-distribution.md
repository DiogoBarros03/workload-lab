# Talos as the cluster distribution

The cluster runs on spare physical machines. Talos was chosen over k3s and kubeadm for its
immutable, API-driven configuration: there is no SSH and no host-level drift, so the
cluster's state is entirely described by machine config committed to this repo.

## Consequences

Nothing can be fixed by logging into a node. Every cluster change — including the insecure
registry mirror in ADR 0003 — is a machine-config edit and a reboot. Talos is not installed
yet, so Wave 4 (C17, C18) is blocked on hardware; the pipeline stops and waits rather than
developing manifests against a substitute distribution.
