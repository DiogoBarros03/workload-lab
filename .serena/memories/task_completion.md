# Task completion

Run before claiming a challenge is done:

1. `npm run lint` — eslint (`complexity` 10) and SonarAnalyzer `S1541` (10). Must exit 0.
2. `npm run test` — vitest in `node:24`. Must exit 0.
3. `npm run contract -- <url>` — from C01 onward, against the running impl. Must be green.
4. Re-read each acceptance box in `tasks/CNN-*.md` and paste the command plus its output as
   evidence for that box. A box without evidence is not ticked.

No coverage number is collected or gated on (ADR 0004). Do not add one.

If an acceptance box cannot be ticked, say so explicitly in the report rather than working
around it. Agents never self-accept; the brain accepts.

Commit with conventional-commit messages on `challenge/CNN-name`. Do not merge to `main`
and do not push unless asked.
