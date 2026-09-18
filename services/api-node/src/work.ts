// The two synchronous-work endpoints, kept out of app.ts so they can be unit-tested directly.
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

export const MB = 1024 * 1024;

export type CpuResult = { ms: number; rounds: number; hash: string };
export type MemoryResult = { mb: number; hold_ms: number };

// Synchronous on purpose: this is the event-loop block C04 measures and C23 moves off-thread.
export function burnCpu(ms: number, rounds: number): CpuResult {
  const started = performance.now();
  let hash = "workload-lab";
  let done = 0;
  while (performance.now() - started < ms) {
    for (let i = 0; i < rounds; i += 1) hash = createHash("sha256").update(hash).digest("hex");
    done += rounds;
  }
  return { ms: Math.round(performance.now() - started), rounds: done, hash };
}

// Filled, not just reserved: untouched pages are never committed and would never OOMKill (C21).
export function allocate(mb: number): Buffer {
  return Buffer.allocUnsafe(mb * MB).fill(0xa5);
}

// Reading byteLength after the await is what keeps the block reachable for the whole hold.
export async function holdMemory(mb: number, hold_ms: number): Promise<MemoryResult> {
  const block = allocate(mb);
  await sleep(hold_ms);
  return { mb: block.byteLength / MB, hold_ms };
}
