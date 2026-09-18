import { defineConfig } from "vitest/config";

import ContractReporter from "./tests/reporter.ts";

export default defineConfig({
  test: {
    include: ["spec/tests/**/*.contract.ts"],
    reporters: [new ContractReporter()],
    testTimeout: 15000,
    hideSkippedTests: true,
  },
});
