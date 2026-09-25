import { curveMonotoneX } from "@visx/curve";
import { Line, LineChart } from "@/components/charts/line-chart";
import type { CpuSample } from "@/hooks/use-status";

export function Sparkline({ samples }: { samples: CpuSample[] }) {
  if (samples.length < 2) {
    return <p className="text-sm text-muted-foreground">Collecting api CPU samples.</p>;
  }
  const data = samples.map((s) => ({ date: new Date(s.at), cores: s.cores }));
  const last = samples[samples.length - 1].cores;
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex justify-between text-sm text-muted-foreground">
        <span>api CPU, last {samples.length * 2} s</span>
        <span className="font-mono text-ink-soft">{last.toFixed(2)} cores</span>
      </figcaption>
      <div role="img" aria-label={`api CPU over the last ${samples.length} samples, now ${last.toFixed(2)} cores`}>
        <LineChart data={data} aspectRatio="6 / 1" margin={{ top: 4, right: 4, bottom: 4, left: 4 }} animationDuration={0}>
          <Line dataKey="cores" curve={curveMonotoneX} animate={false} fadeEdges={false} showHighlight={false} strokeWidth={1.5} />
        </LineChart>
      </div>
    </figure>
  );
}
