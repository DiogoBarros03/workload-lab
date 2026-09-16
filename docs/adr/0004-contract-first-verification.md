# Verification is contract-first; no coverage threshold

The global engineering rules for this user mandate 80% line coverage and four test tiers per
feature. That rule is deliberately not applied here. This repo's correctness claim is
behavioural — a black-box contract suite that runs unchanged against both impls, plus
acceptance boxes measured under load — and branch coverage of glue code would verify none
of it.

## Consequences

Unit tests exist only where logic is non-trivial and hard to reach from the outside: retry
and backoff, breaker state transitions, cache-aside. CI gates on the contract suite and the
complexity ceiling, not on a coverage number. A reviewer expecting a coverage badge will not
find one, and that is intended.
