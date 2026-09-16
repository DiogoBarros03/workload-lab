# Complexity ceiling is 15, not 10

The standing engineering rule for this author is a cyclomatic complexity ceiling of 10.
This repo raises it to 15 by explicit decision. The services here are deliberately full of
branching — knob combinations, retry and breaker state, cache-aside paths, queue backends —
and a ceiling of 10 would have forced extraction that obscured the control flow the
experiments exist to observe.

## Consequences

Do not "fix" this back to 10. It is enforced in two places and they use different
mechanisms: `complexity: ["error", 15]` in `eslint.config.mjs`, and SonarAnalyzer `S1541`
whose **threshold lives in `SonarLint.xml`**, wired in as an `AdditionalFiles` entry. The
`.editorconfig` key `dotnet_diagnostic.S1541.maximumFunctionComplexityThreshold` looks like
it should work and silently does not — it was measured leaving the analyzer at its default
of 10. `.editorconfig` still carries the severity. Both ceilings are guarded by fixtures in
`tools/complexity-fixture/` that sit at exactly 15.
