# workload-lab

A lab for simulating workload types across two language implementations and four
deployment variants, measuring what each one breaks. This file is the glossary.
It contains no implementation detail and no decisions — decisions live in `docs/adr/`.

## Language

### Work units

**Challenge**:
One numbered unit of work (C00–C29) with a single owner folder and a fixed list of
acceptance boxes. The smallest thing that can be accepted or rejected.
_Avoid_: task, ticket, story, step

**Wave**:
An ordered group of challenges. Waves run in sequence; so do the challenges inside them.
_Avoid_: phase, stage, sprint

**Acceptance box**:
One checkbox under a challenge's **Accept when** heading. Every box is either ticked with
evidence or the challenge is rejected. There is no partial acceptance.
_Avoid_: criterion, requirement, DoD item

**Brain**:
The role that reviews and accepts challenges. Held by the human, never by an agent.
_Avoid_: reviewer, lead, orchestrator

**Owner folder**:
The single directory a challenge is permitted to write to. Reading is unrestricted.
_Avoid_: scope, workspace, area

### The system under test

**Impl**:
One language implementation of the contract — `node` or `dotnet`. Both implement the
same contract identically, including metric names.
_Avoid_: implementation, stack, service, language

**Variant**:
A named combination of behavioural flags: `v0` direct, `v1` cache, `v2` queue, `v3`
cache+queue. The unit of comparison in every experiment, and a label on every metric.
_Avoid_: overlay, configuration, mode, flavour

**Overlay**:
The kustomize directory that deploys one variant. An overlay is how a variant is spelled
in `deploy/k8s/`, never a concept of its own.

**Contract**:
The `spec/` directory — OpenAPI document, metric list, knob and parameter tables, and the
test suite that enforces them. Both impls are measured against it unchanged.
_Avoid_: spec, API, interface

**Knob**:
A deploy-time environment variable. Changing one requires a restart, and the set of knob
values is what defines a variant.
_Avoid_: setting, config, flag, option

**Parameter**:
A per-request query parameter. Varies freely within a single load run without restarting
anything.
_Avoid_: knob, argument, option

**Sim config**:
The downstream-sim's runtime settings, set via `PUT /config`. Neither a knob nor a
parameter: it changes mid-experiment without a restart and belongs to the simulator,
not to the system under test.

**Downstream sim**:
The service that stands in for an unreliable third party — configurable latency, jitter,
error rate, timeout rate and rate limit.
_Avoid_: mock, stub, fake, upstream

**Job**:
A unit of deferred work submitted via `POST /jobs`. Runs inline under `WORK=sync` and via
a worker under `WORK=queue`; the submission API is identical either way.
_Avoid_: task, message, event

### Measurement

**Profile**:
A named load shape — `constant`, `ramp`, `spike`, `soak` — parameterised entirely by
environment. Profiles are never edited between runs.
_Avoid_: scenario, test, workload

**Experiment**:
One hypothesis, one changed variable, three runs, and a written result. An experiment
that produced no `results/NNN-*.md` did not happen.
_Avoid_: benchmark, test, run

**Result**:
A file in `results/` stating hypothesis, setup, numbers, what broke, and a conclusion of
five lines or fewer. The primary artifact of this repo.
_Avoid_: report, writeup, analysis
