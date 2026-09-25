import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { niceTicks, secondTicks, toLivePoints, type LivePoint } from "@/lib/chart";
import { fmtInt, fmtMs } from "@/lib/format";
import type { Point } from "@/lib/run";
import { AXIS, GRID, orBlank, Key, REF_LABEL, Waiting, dotSwatch, flagDot, lineSwatch } from "./chart-parts";

type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: LivePoint }> };

function Tip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (!p) return null;
  const rows = [["t", `${p.t.toFixed(1)} s`], ["rps", fmtInt(p.rps)], ["target", fmtInt(p.target)], ["p99", `${fmtMs(p.p99)} ms`], ["errors", fmtInt(p.errors)]];
  return (
    <dl className="grid grid-cols-[auto_auto] gap-x-3 rounded-md border bg-card px-3 py-2 font-mono text-label text-ink-soft">
      {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></div>)}
    </dl>
  );
}

function Legend() {
  return (
    <figcaption className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-label text-muted-foreground">
      <Key swatch={lineSwatch("var(--chart-rps)")}>req/s achieved</Key>
      <Key swatch={lineSwatch("var(--chart-ref)", true)}>req/s target</Key>
      <Key swatch={lineSwatch("var(--chart-p99)")}>p99 ms, right axis</Key>
      <Key swatch={dotSwatch}>window with errors</Key>
    </figcaption>
  );
}

type Props = { series: Point[]; target: number; durationSec: number };

export function LiveChart({ series, target, durationSec }: Props) {
  const data = toLivePoints(series);
  // In-flight requests may finish after the planned duration; the axis follows them.
  const xMax = Math.max(durationSec, Math.ceil(data.at(-1)?.t ?? 0));
  // 10 % headroom keeps the target label inside the plot.
  const left = niceTicks(Math.max(target, ...data.map((p) => p.rps)) * 1.1);
  const right = niceTicks(Math.max(0, ...data.map((p) => p.p99 ?? 0)));
  return (
    <figure className="flex flex-col gap-3" aria-label={`Achieved and target requests per second, and p99 latency, over ${data.length} half-second windows`}>
      <div aria-hidden className="-mb-2 flex justify-between font-mono text-label">
        <span className="text-muted-foreground">req/s</span>
        <span style={{ color: "var(--chart-p99)" }}>p99 ms</span>
      </div>
      <div className="relative h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={orBlank(data)} margin={{ top: 8, right: 4, bottom: 4, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis {...AXIS} dataKey="t" type="number" domain={[0, xMax]} ticks={secondTicks(xMax)} unit=" s" />
            <YAxis {...AXIS} yAxisId="left" domain={[0, left.at(-1) as number]} ticks={left} width={44} allowDataOverflow />
            <YAxis {...AXIS} yAxisId="right" orientation="right" domain={[0, right.at(-1) as number]} ticks={right} width={44} allowDataOverflow />
            <ReferenceLine yAxisId="left" y={target} stroke="var(--chart-ref)" strokeDasharray="4 4" label={{ ...REF_LABEL, value: "target", position: "insideBottomLeft" }} />
            <Tooltip content={Tip} cursor={{ stroke: "var(--line)" }} isAnimationActive={false} />
            <Line yAxisId="left" dataKey="rps" stroke="var(--chart-rps)" strokeWidth={1.75} dot={flagDot("error")} activeDot={{ r: 3 }} isAnimationActive={false} />
            <Line yAxisId="right" dataKey="p99" stroke="var(--chart-p99)" strokeWidth={1} dot={false} activeDot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <Waiting show={data.length === 0} />
      </div>
      <Legend />
    </figure>
  );
}
