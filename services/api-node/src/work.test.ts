import { describe, expect, test } from "vitest";

import { MB, burnCpu, holdMemory } from "./work.ts";

describe("burnCpu", () => {
  test("honours the wall-time budget and counts the rounds it did", () => {
    const result = burnCpu(50, 100);
    expect(result.ms).toBeGreaterThanOrEqual(50);
    expect(result.ms).toBeLessThan(200);
    expect(result.rounds % 100).toBe(0);
    expect(result.rounds).toBeGreaterThan(0);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("ms=0 burns nothing", () => {
    expect(burnCpu(0, 1000)).toMatchObject({ ms: 0, rounds: 0 });
  });
});

test("holdMemory allocates mb and waits hold_ms", async () => {
  const started = performance.now();
  const result = await holdMemory(2, 30);
  expect(result).toEqual({ mb: 2, hold_ms: 30 });
  expect(performance.now() - started).toBeGreaterThanOrEqual(28);
  expect(MB).toBe(1024 * 1024);
});
