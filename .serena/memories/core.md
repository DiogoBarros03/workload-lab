# workload-lab — core

Lab that simulates workload types across two impls (Node, .NET) and four variants
(v0 direct, v1 cache, v2 queue, v3 cache+queue), runs them locally and on Kubernetes, and
measures what each one breaks. The primary artifact is `results/NNN-*.md`, not the services.

## Authority order

`docs/adr/*` > `PLAN.md` > `CONTEXT.md`. Read `PLAN.md` for the challenge list, `CONTEXT.md`
for vocabulary (binding), `docs/adr/` for decisions. None of the three may be edited by a
challenge agent other than the one that owns them.

## Source map

Work is organised as 30 challenges C00–C29, one file each in `tasks/`. A challenge names its
owner folder and its acceptance boxes; nothing else defines scope. Folder map, the five agent
rules, and code style: `mem:conventions`.

Runtimes, version pins and why they differ: `mem:tech_stack`.
The npm entry points and how anything gets run: `mem:suggested_commands`.
What to run before declaring a challenge done: `mem:task_completion`.

## Invariants

- No compose file, ever (ADR 0001). Local orchestration is kube YAML via `podman play kube`.
- Every build, test and lint runs inside a container (ADR 0005). Host SDKs exist only so
  language servers work; nothing may depend on a host SDK at runtime.
- `spec/` is the contract and both impls are measured against it unchanged.
- Verification is contract-first; no coverage threshold (ADR 0004).
- Wave 4 (C17, C18) is blocked on hardware: Talos is not installed, and no substitute
  distribution is used (ADR 0002).
