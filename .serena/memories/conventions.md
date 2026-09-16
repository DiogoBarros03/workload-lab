# Conventions

## The five rules (every agent in this project gets these five lines)

1. Use Serena for navigation and edits.
2. Use any available skill that fits the task before hand-rolling it.
3. Cyclomatic complexity <= 15 per function. Lint fails above.
4. Write only inside your owner folder. Read anywhere.
5. Done = every acceptance box ticked and `npm run contract -- <url>` green.

Rule 5 has no contract suite until C01; until then done = every acceptance box ticked.
An owner folder is named in the challenge's `tasks/CNN-*.md` file and nowhere else.

## Folder map

| Path | Holds |
|---|---|
| `spec/` | the contract: `openapi.yaml`, `metrics.md`, `knobs.md`, `parameters.md`, `tests/` |
| `services/` | `api-node` `api-dotnet` `worker-node` `worker-dotnet` `downstream-sim` |
| `deploy/local/` | kube YAML run by `podman play kube` — there is no compose file (ADR 0001) |
| `deploy/k8s/` | `base/`, `overlays/v0..v3`, `infra/` |
| `loadtest/` | autocannon profiles: constant, ramp, spike, soak |
| `observability/` | `prometheus/`, `grafana/dashboards/` |
| `results/` | experiment reports; `raw/` for generator output (gitignored) |
| `tasks/` | one `CNN-name.md` per challenge, C00–C29 |
| `docs/adr/` | decision records — these win over `PLAN.md` and `CONTEXT.md` |
| `scripts/` | `container.sh` (image runner), `stub.mjs` (unimplemented npm targets) |
| `tools/complexity-fixture/` | guards both complexity ceilings; not part of the system under test |

Empty directories carry a `.gitkeep`.

## Vocabulary

`CONTEXT.md` is the glossary and is binding: challenge, wave, acceptance box, brain, owner
folder, impl, variant, overlay, contract, knob, parameter, sim config, downstream sim, job,
profile, experiment, result. Do not invent synonyms — the glossary lists the rejected ones.

## Code style

- Complexity ceiling 15 is enforced twice: `complexity: ["error", 15]` in `eslint.config.mjs`,
  and SonarAnalyzer `S1541` — severity in `.editorconfig`, **threshold in `SonarLint.xml`**
  (an `AdditionalFiles` entry; the `.editorconfig` threshold key does not work). See ADR 0009.
- TypeScript for Node impls; C# for .NET impls. No third language.
- Variants are knobs, not branches of code: `CACHE=off|redis`, `WORK=sync|queue`,
  `QUEUE=memory|redis|rabbitmq`. One codebase per service.
- No coverage threshold anywhere (ADR 0004). Unit tests only where logic is non-trivial.

## Process

- One branch per challenge: `challenge/CNN-name`, squash-merged to `main` after the gate.
- Agents never self-accept. The brain (human) ticks the acceptance boxes.
- Every experiment writes `results/NNN-name.md` using the template at the end of `PLAN.md`.
