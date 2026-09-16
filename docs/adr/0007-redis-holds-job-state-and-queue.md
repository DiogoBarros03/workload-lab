# Redis holds both job state and the queue

Job records live in the same backend as the queue rather than in a separate database. This
is what makes `QUEUE=memory` genuinely lossy — killing a worker loses both the queued work
and the record of it — which is precisely the failure C12 exists to demonstrate.

## Consequences

C14 compares queue backends with state as a confounding variable, since changing the queue
backend also changes where job records live. That comparison must say so rather than
attributing every difference to the queue implementation.
