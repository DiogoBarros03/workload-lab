# Runtime pins: Node 24 LTS, .NET 10

The two impls pin to different points on their release trains on purpose. Node images pin
24 LTS because C20 and C23 measure event-loop and worker-thread behaviour, and anyone
reproducing those numbers will be on LTS. .NET pins 10 because the container and
native-AOT behaviour being measured in C21 is materially better there than on 8.

## Consequences

The host runs Node 26 for tooling while images run 24; that skew is expected and covered by
ADR 0005. Any results file comparing the impls is comparing an LTS runtime against a
current one, and should not be read as a language comparison.
