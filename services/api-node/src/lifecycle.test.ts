import { afterEach, describe, expect, it, vi } from "vitest";

import { createDrain, isRefused, readyState, runShutdown } from "./lifecycle.ts";

afterEach(() => vi.useRealTimers());

describe("readyState", () => {
  it("is 200 only when ok", () => {
    expect(readyState("ok")).toEqual({ code: 200, status: "ok" });
    expect(readyState("starting")).toEqual({ code: 503, status: "starting" });
    expect(readyState("shutting_down")).toEqual({ code: 503, status: "shutting_down" });
  });
});

describe("isRefused", () => {
  it("refuses work but never the probes once shutting down", () => {
    expect(isRefused("shutting_down", "/cpu?ms=1")).toBe(true);
    expect(isRefused("shutting_down", "/healthz")).toBe(false);
    expect(isRefused("shutting_down", "/readyz")).toBe(false);
    expect(isRefused("shutting_down", "/metrics")).toBe(false);
  });

  it("refuses nothing while serving", () => {
    expect(isRefused("ok", "/cpu")).toBe(false);
    expect(isRefused("starting", "/cpu")).toBe(false);
  });
});

describe("createDrain", () => {
  it("resolves idle immediately when nothing is in flight", async () => {
    await expect(createDrain().idle()).resolves.toBeUndefined();
  });

  it("resolves idle only after the last in-flight request leaves", async () => {
    const drain = createDrain();
    drain.enter();
    drain.enter();
    let idle = false;
    const waiting = drain.idle().then(() => (idle = true));

    drain.leave();
    await Promise.resolve();
    expect(idle).toBe(false);
    expect(drain.inflight()).toBe(1);

    drain.leave();
    await waiting;
    expect(idle).toBe(true);
  });
});

describe("runShutdown", () => {
  it("drains, closes, then exits 0", async () => {
    const order: string[] = [];
    const exit = vi.fn();
    await runShutdown({
      graceMs: 1000,
      idle: async () => void order.push("idle"),
      close: async () => void order.push("close"),
      exit,
    });
    expect(order).toEqual(["idle", "close"]);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits 1 at the deadline when the drain never finishes", async () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    void runShutdown({
      graceMs: 1000,
      idle: () => new Promise<void>(() => {}),
      close: async () => {},
      exit,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits 1 when close throws", async () => {
    const exit = vi.fn();
    await runShutdown({
      graceMs: 1000,
      idle: async () => {},
      close: async () => {
        throw new Error("boom");
      },
      exit,
    });
    expect(exit).toHaveBeenCalledWith(1);
  });
});
