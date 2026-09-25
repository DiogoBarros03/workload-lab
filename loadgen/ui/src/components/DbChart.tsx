import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { dbPoints } from "@/lib/chart";
import type { DbSample } from "@/lib/status";
import { AXIS, GRID, Key, lineSwatch, orBlank, Waiting } from "./chart-parts";

const X_TICKS = [-60, -45, -30, -15, 0];
const line = { strokeWidth: 1.5, dot: false, activeDot: false, isAnimationActive: false } as const;

// Pool queue (left) against commits per second (right); null polls leave gaps.
export function DbChart({ samples }: { samples: DbSample[] }) {
  const data = dbPoints(samples);
  const last = samples.at(-1);
  return (
    <figure className="flex flex-col gap-2" aria-label={last ? `db over the last 60 s, ${last.poolWaiting ?? "unknown"} waiting for the pool` : "db, no samples yet"}>
      <figcaption className="flex flex-wrap justify-between gap-2 text-meta text-muted-foreground">
        <span>db, last 60 s</span>
        <span className="flex gap-4 font-mono text-label">
          <Key swatch={lineSwatch("var(--chart-rps)")}>pool waiting</Key>
          <Key swatch={lineSwatch("var(--chart-commits)")}>commits/s</Key>
        </span>
      </figcaption>
      <div className="relative h-[120px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={orBlank(data)} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis {...AXIS} dataKey="t" type="number" domain={[-60, 0]} ticks={X_TICKS} unit=" s" />
            <YAxis {...AXIS} yAxisId="waiting" domain={[0, "auto"]} tickCount={3} width={40} allowDecimals={false} />
            <YAxis {...AXIS} yAxisId="commits" orientation="right" domain={[0, "auto"]} tickCount={3} width={48} />
            <Line {...line} yAxisId="waiting" dataKey="waiting" stroke="var(--chart-rps)" />
            <Line {...line} yAxisId="commits" dataKey="commits" stroke="var(--chart-commits)" />
          </LineChart>
        </ResponsiveContainer>
        <Waiting show={data.length === 0} />
      </div>
    </figure>
  );
}
