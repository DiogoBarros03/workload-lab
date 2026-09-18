import { describe, expect, test } from "vitest";

import { callUrl, fanout, readDownstream, settle } from "./downstream.ts";
import type { Call } from "./downstream.ts";

const never: AbortSignal = new AbortController().signal;

describe("readDownstream", () => {
  test("strips a trailing slash and defaults the timeout", () => {
    expect(readDownstream({ DOWNSTREAM_URL: "http://sim:8080/" })).toEqual({
      url: "http://sim:8080",
      timeoutMs: 1000,
    });
  });

  test("honours DOWNSTREAM_TIMEOUT_MS", () => {
    expect(readDownstream({ DOWNSTREAM_TIMEOUT_MS: "250" }).timeoutMs).toBe(250);
  });
});

test("callUrl overrides latency only when /io asks it to", () => {
  const down = { url: "http://sim:8080", timeoutMs: 1000 };
  expect(callUrl(down)).toBe("http://sim:8080/call");
  expect(callUrl(down, { ms: 100, jitter: 20 })).toBe(
    "http://sim:8080/call?latency_ms=100&jitter_ms=20",
  );
});

describe("settle", () => {
  test("a connection error is a failed call, not a timeout", async () => {
    const boom: Call = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(settle(boom, never)).resolves.toBe(false);
  });

  test("the deadline escapes so the route can answer 504", async () => {
    const aborted = AbortSignal.abort();
    const boom: Call = async () => {
      throw new Error("aborted");
    };
    await expect(settle(boom, aborted)).rejects.toThrow("aborted");
  });
});

describe("fanout", () => {
  const alternating = (): Call => {
    let i = 0;
    return async () => (i++ % 2 === 0) as boolean;
  };

  test("tallies ok and failed across n calls", async () => {
    const result = await fanout(alternating(), 4, "serial", never);
    expect(result).toMatchObject({ n: 4, mode: "serial", ok: 2, failed: 2 });
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });

  test("parallel overlaps, serial does not", async () => {
    const slow: Call = async () => {
      await new Promise((r) => setTimeout(r, 40));
      return true;
    };
    const parallel = await fanout(slow, 4, "parallel", never);
    const serial = await fanout(slow, 4, "serial", never);
    expect(parallel.ok).toBe(4);
    expect(parallel.ms).toBeLessThan(serial.ms);
    expect(serial.ms).toBeGreaterThanOrEqual(150);
  });
});
