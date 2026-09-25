import { Grid } from "@/components/charts/grid";
import { curveMonotoneX } from "@visx/curve";
import { Line, LineChart } from "@/components/charts/line-chart";
import type { Point } from "@/lib/run";

const LINE = { curve: curveMonotoneX, animate: false, fadeEdges: false, strokeWidth: 1.5 } as const;

function Key({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return <span className="flex items-center gap-2"><span aria-hidden className={`h-0 w-4 border-t-2 ${swatch}`} />{children}</span>;
}

// ponytail: windows with no completions have no p99 and are left out of the chart.
export function LiveChart({ series }: { series: Point[] }) {
  const data = series
    .filter((p) => p.p99 !== null)
    .map((p) => ({ date: new Date(p.elapsedMs), rps: p.rps, target: p.targetRps, p99: p.p99 }));
  if (data.length < 2) return null;
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <Key swatch="border-(--chart-1)">req/s achieved</Key>
        <Key swatch="border-dashed border-(--chart-2)">req/s target</Key>
        <Key swatch="border-(--chart-2)">p99 ms, own scale</Key>
      </figcaption>
      <div role="img" aria-label={`Achieved and target requests per second, and p99 latency, over ${data.length} half-second windows`}>
        <LineChart data={data} aspectRatio="3 / 1" margin={{ top: 8, right: 8, bottom: 8, left: 8 }} animationDuration={0}>
          <Grid horizontal numTicksRows={4} />
          <Line dataKey="rps" yAxisId="left" stroke="var(--chart-1)" {...LINE} />
          <Line dataKey="target" yAxisId="left" stroke="var(--chart-2)" dashFromIndex={0} showHighlight={false} {...LINE} strokeWidth={1} />
          <Line dataKey="p99" yAxisId="right" stroke="var(--chart-2)" {...LINE} />
        </LineChart>
      </div>
    </figure>
  );
}
