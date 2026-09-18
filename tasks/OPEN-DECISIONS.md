# Open decisions

Raised at a gate, not yet ruled on by the brain. Each says what breaks if it stays open.
Close one by making the edit and deleting its section.

## 1. `openapi.yaml` is unsigned

C01's fifth acceptance box reserves a line for the brain's review and date. It is still blank
and no agent may fill it. C01 merged with this box unticked.
**Blocks:** nothing mechanically. It is the only box in the project a human must tick.

## 2. `/flaky` injects locally, but C06 measures the sim

`spec/openapi.yaml` defines `/flaky` as injecting failure in the api itself, sim not involved.
C06's boxes read `sim error_rate 0.5` and `sim call count does not increase`.
**Proposed:** `/flaky` stays self-contained — that is what makes it deterministic at rate 0 and
contract-testable — and C06's retry/breaker acceptance moves to `/io` and `/fanout`, which do
call the sim. A breaker around a local failure injector protects nothing.
**Blocks:** C06 cannot be accepted until ruled.

## 3. Jitter is symmetric in the sim, additive in the contract

`spec/parameters.md` says jitter is "on top of `ms`". `services/downstream-sim` draws uniformly
over `latency_ms ± jitter_ms`, which is why C02's p50 landed on 100 rather than ~110.
**Proposed:** amend `spec/parameters.md` to symmetric. It is what the C02 acceptance box was
written for, and it keeps p50 equal to the configured latency.
**Blocks:** C05 will implement `/io?ms=&jitter=` against whichever reading survives.

## 4. `/catalog/{id}` has no owner

`spec/openapi.yaml` says catalog items "are served by the downstream sim", but C10's owner
folders are the two api services, so no agent may add the endpoint to the sim.
**Options:** (a) C10 gets write access to `services/downstream-sim/`; (b) the api synthesises the
item body and uses `GET /call` purely for the latency cost — needs no change to anything built.
**Blocks:** C10.

## 5. Nothing type-checks the TypeScript

There is no `tsconfig.json` anywhere, no `@types/node`, and eslint runs typescript-eslint
un-type-checked. Node 24 strips type annotations without validating them, so every annotation
in `services/` is decoration. This also breaks the standing engineering rule that a task is not
complete until the project's type-checker is green — there is no type-checker to run.
**Options:** (a) add a root `tsconfig.json` + `@types/node` and an `npm run typecheck` wired into
CI; (b) accept it and say so explicitly, on the grounds that the contract suite is the gate
(ADR 0004). **Blocks:** nothing today; gets more expensive every challenge.

## 6. The results template asks for p95; autocannon has no p95 bucket

`PLAN.md`'s Results template line reads `p50 / p95 / p99`. autocannon reports p50, p97.5, p99 —
there is no p95 bucket. C04 reported p97.5 in its place and said so.
**Options:** (a) change the template to `p50 / p97.5 / p99`; (b) compute p95 from autocannon's
histogram in C07's profile runner and keep the template.
**Blocks:** nothing, but every result file from here on inherits whichever is chosen, and
changing it later makes earlier results non-comparable.
