import { Meter } from "./Meter";

type Props = { label: string; used: number | null; limit: number | null; fmt: (v: number) => string };

// No limit means no bar: a ratio against nothing would be invented.
export function Gauge({ label, used, limit, fmt }: Props) {
  const usedText = used === null ? "–" : fmt(used);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-ink-soft">
          {limit === null ? `${usedText} · no limit` : `${usedText} / ${fmt(limit)}`}
        </span>
      </div>
      {limit !== null && used !== null && <Meter value={used} max={limit} label={`${label} used of limit`} />}
    </div>
  );
}
