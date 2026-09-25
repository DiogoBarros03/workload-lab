import type { Cgroup } from "./cgroup.ts";

export type Prev = { readonly api: Cgroup | null; readonly loadgen: Cgroup | null };

export type Container = {
  service: string;
  up: boolean;
  cpuCores: number | null;
  cpuQuotaCores: number | null;
  nrThrottled: number | null;
  memBytes: number | null;
  memMaxBytes: number | null;
};

type Input = { apiHealth: number | null; apiStats: Cgroup | null; selfStats: Cgroup; prev: Prev };

// Negative usage delta means the container restarted between samples.
function cpuCores(prev: Cgroup | null, cur: Cgroup | null) {
  if (prev?.cpuUsageUsec == null || cur?.cpuUsageUsec == null) return null;
  const wallUsec = (cur.sampledAtMs - prev.sampledAtMs) * 1000;
  const used = cur.cpuUsageUsec - prev.cpuUsageUsec;
  return wallUsec > 0 && used >= 0 ? used / wallUsec : null;
}

// Null stats are a valid state: down, or a service with no HTTP (db).
const row = (service: string, up: boolean, cur: Cgroup | null, prev: Cgroup | null): Container => ({
  service,
  up,
  cpuCores: cpuCores(prev, cur),
  cpuQuotaCores: cur?.cpuQuotaCores ?? null,
  nrThrottled: cur?.nrThrottled ?? null,
  memBytes: cur?.memCurrentBytes ?? null,
  memMaxBytes: cur?.memMaxBytes ?? null,
});

export function buildStatus({ apiHealth, apiStats, selfStats, prev }: Input) {
  const apiUp = apiHealth !== null;
  const containers = [
    row("api", apiUp, apiUp ? apiStats : null, prev.api),
    row("db", apiHealth === 200, null, null),
    row("loadgen", true, selfStats, prev.loadgen),
  ];
  return { containers: containers.toSorted((a, b) => a.service.localeCompare(b.service)) };
}
