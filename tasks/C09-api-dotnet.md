# C09 · api-dotnet

Wave 2 — C# parity

Owner: `services/api-dotnet` · Needs: C01, C02

Build: the full contract on .NET 10, same knobs, Containerfile.

Accept when:
- [ ] `npm run contract` passes with the suite unchanged
- [ ] `results/003-node-vs-dotnet-cpu.md`: `/cpu` and `/fanout`, same profile, both impls,
      noting that this compares an LTS runtime against a current one (ADR 0008)
- [ ] metric-name parity is **deferred to C08** and recorded as an open item
