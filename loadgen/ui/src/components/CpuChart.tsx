import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { cpuPoints, niceTicks } from "@/lib/chart";
import type { CpuSample } from "@/lib/status";
import { AXIS, GRID, orBlank, REF_LABEL, Waiting, flagDot } from "./chart-parts";

const X_TICKS = [-60, -45, -30, -15, 0];

// Cores against the quota; red dots where the kernel throttled the api.
export function CpuChart({ samples }: { samples: CpuSample[] }) {
  const data = cpuPoints(samples);
  const last = samples.at(-1);
  const quota = last?.quota ?? null;
  // Without a quota the scale follows the samples.
  const top = quota ?? (niceTicks(Math.max(0, ...data.map((p) => p.cores))).at(-1) as number);
  return (
    <figure className="flex flex-col gap-2" aria-label={last ? `api CPU over the last 60 s, now ${last.cores.toFixed(2)} cores` : "api CPU, no samples yet"}>
      <figcaption className="flex justify-between text-meta text-muted-foreground">
        <span>api CPU, last 60 s</span>
        <span className="font-mono text-ink-soft">{last ? `${last.cores.toFixed(2)} cores` : "–"}</span>
      </figcaption>
      <div className="relative h-[120px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={orBlank(data)} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis {...AXIS} dataKey="t" type="number" domain={[-60, 0]} ticks={X_TICKS} unit=" s" />
            <YAxis {...AXIS} domain={[0, top]} tickCount={3} width={40} allowDataOverflow />
            {quota !== null && (
              <ReferenceLine y={quota} stroke="var(--chart-ref)" strokeDasharray="4 4" ifOverflow="extendDomain" label={{ ...REF_LABEL, value: `quota ${quota.toFixed(2)}`, position: "insideTopLeft" }} />
            )}
            <Line dataKey="cores" stroke="var(--chart-rps)" strokeWidth={1.5} dot={flagDot("throttled")} activeDot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <Waiting show={data.length === 0} />
      </div>
    </figure>
  );
}
