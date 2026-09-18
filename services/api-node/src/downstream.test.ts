import { describe, expect, test } from "vitest";

import {
  backoffMs,
  callUrl,
  createBreaker,
  fanout,
  readBreakerConfig,
  readDownstream,
  readRetry,
  settle,
} from "./downstream.ts";
import type { BreakerConfig, Call, Policy } from "./downstream.ts";

const never: AbortSignal = new AbortController().signal;

const OFF: BreakerConfig = { enabled: false, threshold: 5, resetMs: 5000 };

// A policy with no retries and no breaker: the C05 behaviour, still the default.
const plain = (max = 0): Policy => ({
  retry: { max, backoffMs: 0 },
  breaker: createBreaker(OFF),
});

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
    await expect(settle(boom, never, plain())).resolves.toEqual({ ok: false, attempts: 1 });
  });

  test("the deadline escapes so the route can answer 504", async () => {
    const aborted = AbortSignal.abort();
    const boom: Call = async () => {
      throw new Error("aborted");
    };
    await expect(settle(boom, aborted, plain())).rejects.toThrow("aborted");
  });

  test("retries up to RETRY_MAX, then gives up and reports the attempts it made", async () => {
    let calls = 0;
    const always: Call = async () => {
      calls += 1;
      return false;
    };
    await expect(settle(always, never, plain(3))).resolves.toEqual({ ok: false, attempts: 4 });
    expect(calls).toBe(4);
  });

  test("stops at the first success, so a transient failure costs one extra call", async () => {
    let calls = 0;
    const flaky: Call = async () => (calls += 1) > 1;
    await expect(settle(flaky, never, plain(3))).resolves.toEqual({ ok: true, attempts: 2 });
  });

  test("an open breaker refuses without calling at all", async () => {
    const breaker = createBreaker({ enabled: true, threshold: 1, resetMs: 5000 });
    breaker.record(false);

    let calls = 0;
    const counted: Call = async () => {
      calls += 1;
      return true;
    };
    await expect(settle(counted, never, { retry: { max: 3, backoffMs: 0 }, breaker })).rejects.toThrow(
      "breaker_open",
    );
    expect(calls).toBe(0);
  });

  test("a deadline during retries still counts as a failure against the breaker", async () => {
    const breaker = createBreaker({ enabled: true, threshold: 1, resetMs: 5000 });
    const aborted = AbortSignal.abort();
    const boom: Call = async () => {
      throw new Error("aborted");
    };
    await expect(
      settle(boom, aborted, { retry: { max: 0, backoffMs: 0 }, breaker }),
    ).rejects.toThrow();
    expect(breaker.state()).toBe("open");
  });
});

describe("retry and breaker knobs", () => {
  test("default to retries off and the breaker off", () => {
    expect(readRetry({})).toEqual({ max: 0, backoffMs: 50 });
    expect(readBreakerConfig({})).toEqual({ enabled: false, threshold: 5, resetMs: 5000 });
  });

  test("read every knob spec/knobs.md names", () => {
    expect(readRetry({ RETRY_MAX: "3", RETRY_BACKOFF_MS: "20" })).toEqual({ max: 3, backoffMs: 20 });
    expect(
      readBreakerConfig({ BREAKER: "on", BREAKER_FAILURE_THRESHOLD: "2", BREAKER_RESET_MS: "300" }),
    ).toEqual({ enabled: true, threshold: 2, resetMs: 300 });
  });
});

describe("backoffMs", () => {
  test("full jitter: uniform over a window that doubles each attempt", () => {
    expect(backoffMs(50, 1, () => 1)).toBe(50);
    expect(backoffMs(50, 3, () => 1)).toBe(200);
    expect(backoffMs(50, 3, () => 0)).toBe(0);
    expect(backoffMs(50, 2, () => 0.5)).toBe(50);
  });
});

describe("createBreaker", () => {
  const clock = () => {
    let now = 0;
    return { now: () => now, advance: (ms: number) => void (now += ms) };
  };

  test("off means always closed, however many calls fail", () => {
    const breaker = createBreaker(OFF);
    for (let i = 0; i < 20; i += 1) breaker.record(false);
    expect(breaker.allow()).toBe(true);
    expect(breaker.state()).toBe("closed");
  });

  test("opens on the Nth consecutive failure, not the Nth failure overall", () => {
    const breaker = createBreaker({ enabled: true, threshold: 3, resetMs: 1000 });
    breaker.record(false);
    breaker.record(false);
    breaker.record(true);
    breaker.record(false);
    breaker.record(false);
    expect(breaker.state()).toBe("closed");
    breaker.record(false);
    expect(breaker.state()).toBe("open");
    expect(breaker.allow()).toBe(false);
  });

  test("half-opens after BREAKER_RESET_MS and admits exactly one probe", () => {
    const time = clock();
    const breaker = createBreaker({ enabled: true, threshold: 1, resetMs: 500 }, time.now);
    breaker.record(false);

    time.advance(499);
    expect(breaker.allow()).toBe(false);

    time.advance(1);
    expect(breaker.state()).toBe("half_open");
    expect(breaker.allow()).toBe(true);
    expect(breaker.allow()).toBe(false);
  });

  test("a failing probe re-opens for another full window; a passing one closes", () => {
    const time = clock();
    const breaker = createBreaker({ enabled: true, threshold: 1, resetMs: 500 }, time.now);
    breaker.record(false);
    time.advance(500);

    expect(breaker.allow()).toBe(true);
    breaker.record(false);
    expect(breaker.state()).toBe("open");

    time.advance(500);
    expect(breaker.allow()).toBe(true);
    breaker.record(true);
    expect(breaker.state()).toBe("closed");
    expect(breaker.allow()).toBe(true);
  });
});

describe("fanout", () => {
  const alternating = (): Call => {
    let i = 0;
    return async () => (i++ % 2 === 0) as boolean;
  };

  test("tallies ok and failed across n calls", async () => {
    const result = await fanout(alternating(), 4, "serial", never, plain());
    expect(result).toMatchObject({ n: 4, mode: "serial", ok: 2, failed: 2 });
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });

  test("parallel overlaps, serial does not", async () => {
    const slow: Call = async () => {
      await new Promise((r) => setTimeout(r, 40));
      return true;
    };
    const parallel = await fanout(slow, 4, "parallel", never, plain());
    const serial = await fanout(slow, 4, "serial", never, plain());
    expect(parallel.ok).toBe(4);
    expect(parallel.ms).toBeLessThan(serial.ms);
    expect(serial.ms).toBeGreaterThanOrEqual(150);
  });
});
