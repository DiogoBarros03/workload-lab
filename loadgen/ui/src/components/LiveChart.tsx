import { Grid } from "@/components/charts/grid";
import { curveMonotoneX } from "@visx/curve";
import { Line, LineChart } from "@/components/charts/line-chart";
import type { Point } from "@/lib/run";

// ponytail: windows with no completions have no p99 and are left out of the chart.
export function LiveChart({ series }: { series: Point[] }) {
  const data = series
    .filter((p) => p.p99 !== null)
    .map((p) => ({ date: new Date(p.elapsedMs), rps: p.rps, p99: p.p99 }));
  if (data.length < 2) return null;
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-2"><span aria-hidden className="h-0.5 w-4 bg-(--chart-1)" />req/s</span>
        <span className="flex items-center gap-2"><span aria-hidden className="h-0.5 w-4 bg-(--chart-2)" />p99 ms, own scale</span>
      </figcaption>
      <div role="img" aria-label={`Requests per second and p99 latency over ${data.length} half-second windows`}>
        <LineChart data={data} aspectRatio="3 / 1" margin={{ top: 8, right: 8, bottom: 8, left: 8 }} animationDuration={0}>
          <Grid horizontal numTicksRows={4} />
          <Line dataKey="rps" yAxisId="left" stroke="var(--chart-1)" curve={curveMonotoneX} animate={false} fadeEdges={false} strokeWidth={1.5} />
          <Line dataKey="p99" yAxisId="right" stroke="var(--chart-2)" curve={curveMonotoneX} animate={false} fadeEdges={false} strokeWidth={1.5} />
        </LineChart>
      </div>
    </figure>
  );
}
