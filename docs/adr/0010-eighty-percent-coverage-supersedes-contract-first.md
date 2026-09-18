---
status: accepted
supersedes: ADR-0004
---

# 80% coverage and the four tiers, superseding contract-first

ADR 0004 set this repo's verification to contract-first with no coverage threshold. That is
reversed as of 2026-09-17: the standing engineering rule — 80% line coverage and the full tier
set — applies here after all. The deciding argument is that this repo is a portfolio artifact
as much as an experiment, and a public repo whose defence of thin unit testing is an ADR reads
as a rationalisation rather than a decision.

## Consequences

The contract suite remains the behavioural gate and is not replaced — it is now the integration
tier of a larger set, not the whole of it. Every service carries unit tests to 80% line coverage,
enforced in CI; a challenge is not done until its own code meets the floor. `services/api-node`
and `services/downstream-sim` were retrofitted rather than grandfathered, because a floor that
exempts existing code is not a floor.

The cost ADR 0004 named is real and was accepted knowingly: some of this coverage tests glue the
contract suite already exercises end to end. Coverage is a floor, not the goal — a test that
cannot fail is worse than no test, and the measured acceptance boxes remain the thing that
actually proves the system works.
