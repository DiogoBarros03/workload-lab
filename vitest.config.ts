import { defineConfig } from "vitest/config";

// The unit tier. The contract suite is the integration tier and has its own config (ADR 0010).
const SERVICES = ["services/api-node/src/**", "services/downstream-sim/src/**"];

export default defineConfig({
  test: {
    include: ["services/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Denominator is service source only: measure/ and spec/ are the instruments, not the subject.
      include: ["services/*/src/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text"],
      thresholds: Object.fromEntries(SERVICES.map((glob) => [glob, { lines: 80 }])),
    },
  },
});
