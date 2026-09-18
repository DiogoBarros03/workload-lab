# Parameters

A **parameter** is a per-request query parameter. It varies freely within a single load run
without restarting anything (`CONTEXT.md`).

Deploy-time environment variables are in [`knobs.md`](./knobs.md) and never appear here. The
downstream sim's runtime settings are **sim config**, set via `PUT /config`, and belong in
neither table.

## Table

| Parameter | Endpoint | Type | Default | Meaning |
|---|---|---|---|---|
| `ms` | `/cpu`, `/io` | integer ≥ 0 | `0` | `/cpu`: burn CPU until this much wall time has elapsed. `/io`: latency to ask the downstream sim for. |
| `rounds` | `/cpu` | integer ≥ 1 | `1000` | Hash rounds per burn iteration. Controls granularity, not total work. |
| `mb` | `/memory` | integer ≥ 0 | `1` | Megabytes to allocate and keep reachable. |
| `hold_ms` | `/memory` | integer ≥ 0 | `0` | How long to hold the allocation before releasing it and responding. |
| `jitter` | `/io` | integer ≥ 0 | `0` | Milliseconds of jitter to ask the downstream sim for, symmetric: latency is drawn uniformly over `ms` ± `jitter`, floored at 0. |
| `n` | `/fanout` | integer ≥ 1 | `1` | Number of downstream sim calls to make. |
| `mode` | `/fanout` | `parallel` \| `serial` | `parallel` | Whether the `n` calls overlap or run one after another. |
| `error_rate` | `/flaky` | number 0.0–1.0 | `0` | Probability this request answers `500` instead of doing its work. |
| `timeout_rate` | `/flaky` | number 0.0–1.0 | `0` | Probability this request answers `504` instead of doing its work. |

Later challenges add their own rows here when they add a parameter.

## Not query parameters

- **Path parameters.** `/catalog/{id}` and `/jobs/{id}` take an id in the path.
- **Body fields.** `POST /jobs` takes `type` and `payload` in a JSON body.
- **Sim config.** `latency_ms`, `jitter_ms`, `latency_shape`, `seed`, `error_rate`,
  `timeout_rate`, `rate_limit_rps` are the downstream sim's own runtime settings
  (`PUT /config`), not parameters of the system under test. `latency_shape` is `uniform`
  (default, the wait is uniform over `latency_ms ± jitter_ms`) or `lognormal` (median stays
  `latency_ms`; `jitter_ms / latency_ms` is the log-space sigma, so the tail is unbounded).
  `seed` seeds every draw the sim makes and `PUT /config` re-seeds, so an arm replays
  exactly. `PUT /outage {duration_ms}` is likewise the sim's own control, not a parameter:
  it fails every call with `503` for the window, then recovers. `/flaky`'s `error_rate` and
  `timeout_rate` are separate values that happen to share a name; they inject failure in the
  api itself, without involving the sim.

## Validation

An out-of-range, non-numeric or unknown-enum value is a `400` with an `Error` body. Unknown
query parameters are ignored.
