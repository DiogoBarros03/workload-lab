import { Meter } from "./Meter";

type Props = { label: string; used: number | null; limit: number | null; fmt: (v: number) => string; tag?: React.ReactNode };

function reading(used: number | null, limit: number | null, fmt: (v: number) => string) {
  const usedText = used === null ? "–" : fmt(used);
  if (limit !== null) return `${usedText} / ${fmt(limit)}`;
  return used === null ? "–" : `${usedText} · no limit`;
}

// No limit means no bar: a ratio against nothing would be invented.
// The bar slot keeps its height either way, so rows do not jump.
export function Gauge({ label, used, limit, fmt, tag }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-2 text-meta">
        <span className="flex items-center gap-2 text-muted-foreground">{label}{tag}</span>
        <span className="font-mono text-ink-soft">{reading(used, limit, fmt)}</span>
      </div>
      <div className="h-1">{limit !== null && <Meter value={used} max={limit} label={`${label} used of limit`} />}</div>
    </div>
  );
}
