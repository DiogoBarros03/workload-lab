# Metrics

**This file is deliberately empty of metric names. Its content is deferred to C08.**

Nothing here may be filled in before then. C08 owns this file jointly with
`observability/`, and its acceptance boxes are what make the list exhaustive:

- `spec/metrics.md` is exhaustive — an impl exposing an unlisted metric fails the suite
- the metric name set from `/metrics` is identical across impls (empty diff)
- labels `impl=node|dotnet` and `variant=v0|v1|v2|v3` are on every metric

C01 invents no metric names, because a name invented before anything emits it is a guess
that both impls then have to live with.

## What C01 does fix

`/metrics` exists from C03 onward and is part of the contract now:

- `GET /metrics` answers `200`.
- The `Content-Type` is Prometheus text exposition format — `text/plain; version=0.0.4;
  charset=utf-8`. The contract suite asserts the `text/plain` prefix only, so a future
  exposition-format version bump is not a contract break.
- A well-formed but empty body is valid until C08. Emptiness is not asserted in either
  direction.

## Metric names

Deferred to C08. Intentionally empty.

## Labels

Deferred to C08. Intentionally empty.

## Units

Deferred to C08. Intentionally empty.
