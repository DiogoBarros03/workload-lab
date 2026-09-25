import { loadTone } from "@/lib/status";

const BG = { fill: "bg-bar-fill", warn: "bg-bar-warn", hot: "bg-bar-hot", muted: "bg-muted-foreground" } as const;
const WORD = { fill: "normal", warn: "high", hot: "critical", muted: "unknown" } as const;

// A thin flat bar; scaleX keeps updates on the compositor, colour follows load.
export function Meter({ value, max, label }: { value: number | null; max: number; label: string }) {
  const ratio = value === null ? null : Math.max(0, value / max);
  const tone = loadTone(ratio);
  const pct = ratio === null ? "no data" : `${Math.round(ratio * 100)} %`;
  return (
    <div
      role="meter" aria-label={`${label}: ${pct}, ${WORD[tone]}`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value ?? undefined}
      className="h-1 w-full overflow-hidden rounded-sm bg-track"
    >
      <div
        className={`h-full origin-left ${BG[tone]} transition-[transform,background-color] duration-[500ms,200ms]`}
        style={{ transform: `scaleX(${Math.min(1, ratio ?? 0)})` }}
      />
    </div>
  );
}
