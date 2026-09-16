# autocannon as the load generator

k6 is the obvious choice here and was rejected: it is another runtime to install and
another language in the repo, while autocannon is a Node dependency in a repo that already
runs Node. It is used as a library rather than a CLI, so `constant`, `ramp`, `spike` and
`soak` are small JavaScript files parameterised entirely by environment.

## Consequences

Load generation is single-process and single-machine. Once the cluster can absorb more
traffic than one generator produces, this decision has to be revisited — distributed load
is the one thing k6 and Gatling do that autocannon does not.
