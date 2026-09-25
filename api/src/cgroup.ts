import { readFileSync } from "node:fs";

export type Cgroup = {
  cpuUsageUsec: number | null;
  cpuQuotaCores: number | null;
  nrThrottled: number | null;
  throttledUsec: number | null;
  memCurrentBytes: number | null;
  memMaxBytes: number | null;
  sampledAtMs: number;
};

const int = (s = "") => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

// "max" and garbage both give null: the UI treats null as no limit.
export const parseMemMax = (text: string) => int(text);

export function parseCpuMax(text: string) {
  const [quota, period] = text.trim().split(/\s+/);
  const q = int(quota);
  const p = int(period);
  return q !== null && p ? q / p : null;
}

export function parseCpuStat(text: string) {
  const fields = new Map(text.split("\n").map((l) => l.trim().split(/\s+/) as [string, string | undefined]));
  const field = (k: string) => int(fields.get(k));
  return { cpuUsageUsec: field("usage_usec"), nrThrottled: field("nr_throttled"), throttledUsec: field("throttled_usec") };
}

// A missing file (no cgroup v2, no controller) parses to null fields.
function read(root: string, name: string) {
  try {
    return readFileSync(`${root}/${name}`, "utf8");
  } catch {
    return "";
  }
}

export function readCgroup(root = "/sys/fs/cgroup"): Cgroup {
  return {
    ...parseCpuStat(read(root, "cpu.stat")),
    cpuQuotaCores: parseCpuMax(read(root, "cpu.max")),
    memCurrentBytes: int(read(root, "memory.current")),
    memMaxBytes: parseMemMax(read(root, "memory.max")),
    sampledAtMs: Date.now(),
  };
}
