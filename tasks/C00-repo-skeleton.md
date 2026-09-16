# C00 · Repo skeleton + tooling

Wave 0 — foundation (brain only, sequential)

Owner: root · Needs: —

Build: the folders above, npm scripts with stub targets, eslint with
`complexity: [error, 10]` and a Roslyn/Sonar analyzer at the same threshold, GitHub Actions
running both plus the contract suite in containers, and this section split into
`tasks/CNN-name.md`.

Accept when:
- [ ] `npm run test` and `npm run lint` run green on an empty repo, both inside containers
- [ ] CI runs the same container images on push and is green
- [ ] the complexity ceiling actually fails a deliberately over-complex function, in both languages
- [ ] `tasks/` has one file per challenge with the same content as here
- [ ] Serena is activated, onboarding has run, and `.serena/memories/conventions.md` states
      the five rules and the folder map
