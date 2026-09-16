# Builds run in containers; host SDKs exist only for editor tooling

Every build, test and lint for both impls runs inside a container, so `npm run test`
behaves identically on this machine and on a CI runner and there is no "works on my
machine" gap. The .NET and Node SDKs are still installed on the host, but for one reason
only: Serena's language servers need them to provide symbol navigation, and editing half
the codebase without an LSP was judged worse than a slightly dirtier host.

## Consequences

The host toolchain is for reading code and the containers are for running it; the two are
allowed to differ in version and nothing should ever depend on the host SDK at runtime.
Container builds need a mounted package cache or the inner loop becomes unusable.
