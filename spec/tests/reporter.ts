// One line per endpoint, so a failing run reads as a list of endpoints, not a wall of stacks.

interface CaseResult {
  state: string;
  errors?: readonly { message?: string }[];
}

interface Case {
  name: string;
  result(): CaseResult;
}

const LINE = { passed: "ok  ", failed: "FAIL", skipped: "skip" } as const;

function firstLine(result: CaseResult): string {
  const message = result.errors?.[0]?.message ?? "";
  return message.split("\n")[0].trim();
}

export default class ContractReporter {
  private passed = 0;
  private failed = 0;

  onTestCaseResult(test: Case): void {
    const result = test.result();
    const tag = LINE[result.state as keyof typeof LINE] ?? result.state;
    const reason = result.state === "failed" ? ` — ${firstLine(result)}` : "";
    if (result.state === "failed") this.failed += 1;
    if (result.state === "passed") this.passed += 1;
    console.log(`${tag}  ${test.name}${reason}`);
  }

  onTestRunEnd(): void {
    console.log(`\ncontract: ${this.passed} passed, ${this.failed} failed`);
  }
}
