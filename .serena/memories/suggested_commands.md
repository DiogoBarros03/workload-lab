# Suggested commands

npm scripts are the single entry point. Never invoke podman by hand for lint/test/build.

| Command | Does |
|---|---|
| `npm run lint` | `lint:node` then `lint:dotnet` — both container-internal |
| `npm run lint:node` | eslint in `node:24` |
| `npm run lint:dotnet` | `dotnet build tools/complexity-fixture` in `sdk:10.0`; S1541 fails the build |
| `npm run test` | vitest in `node:24` (`--passWithNoTests` until C01 lands real tests) |
| `npm run ci` | lint + test; the local equivalent of `.github/workflows/ci.yml` |
| `npm run up -- <variant>` | bring a variant up locally — stub until C16 |
| `npm run load -- <profile> <url>` | run a load profile — stub until C07 |
| `npm run contract -- <url>` | run the contract suite against any base URL — stub until C01 |
| `npm run k8s -- <variant>` | apply an overlay — stub until C17 |

Dependency install also runs in the container; `scripts/container.sh` does `npm ci` on its
own when `node_modules` is missing. Do not run `npm install` on the host.

Never install anything on the host — no .NET SDK, no global npm package, no mise install.
If something seems to require it, stop and report instead.
