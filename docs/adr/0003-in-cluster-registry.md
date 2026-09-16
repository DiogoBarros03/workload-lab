# Images are distributed by an in-cluster registry

Worker nodes cannot pull from a laptop's local podman image store. Rather than push to
ghcr.io, a `registry:2` runs inside the cluster and images are pushed to it from the
development machine, keeping the whole loop on the LAN with no dependency on internet
access or CI availability.

## Consequences

Talos must be given a `registries.mirrors` entry with TLS verification skipped, which is a
machine-config change (see ADR 0002). Nothing is reproducible from outside the LAN: a
stranger cloning this repo can build the images but cannot pull them.
