# Tech stack

| Thing | Pin | Note |
|---|---|---|
| Node images | `docker.io/library/node:24` | LTS, per ADR 0008 |
| .NET images | `mcr.microsoft.com/dotnet/sdk:10.0` | ADR 0008 |
| Host Node | 26 (mise) | tooling only; the skew from image Node 24 is expected (ADR 0005) |
| Container engine | rootless **podman** 6 | `docker` on this host is a podman shim; scripts say `podman` |
| Lint (TS) | eslint 9 flat config + typescript-eslint | `eslint.config.mjs` |
| Lint (C#) | SonarAnalyzer.CSharp, pinned in `Directory.Build.props` | rule `S1541`, configured in `.editorconfig` |
| Tests | vitest | contract suite is Node + vitest, black-box over HTTP |
| Load generation | autocannon, used as a **library** not a CLI (ADR 0006) | no k6, no Gatling |
| Queue/state | redis holds both the queue and job records (ADR 0007); rabbitmq added in C14 |
| Cluster | Talos, images served by an in-cluster `registry:2` (ADR 0002, 0003) | not installed yet |

Deliberately absent and not to be reintroduced: Docker Compose, `just`, Makefile, k6,
coverage thresholds.

## Container execution

`scripts/container.sh <image> <cmd...>` runs a command in the given image. It passes the
command straight through when `/run/.containerenv` or `/.dockerenv` exists, which is how the
same npm scripts work unchanged inside GitHub Actions job containers. A named podman volume
is mounted at `/cache` per image and wired to `npm_config_cache` and `NUGET_PACKAGES` —
without it the inner loop is unusable (ADR 0005).

Rootless podman maps container root to the host user, so files the container writes into the
mounted repo come back owned by the host user. Do not add `--userns=keep-id`.
