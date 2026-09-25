import { cn } from "@/lib/utils";

// Fraction is 0..1; exposed to assistive tech as a percentage.
export function ProgressBar({ fraction, failing }: { fraction: number; failing: boolean }) {
  const pct = Math.round(fraction * 100);
  return (
    <div role="progressbar" aria-label="Run progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1 w-full overflow-hidden rounded-sm bg-track">
      <div className={cn("h-full origin-left transition-transform duration-300", failing ? "bg-red-fg" : "bg-fill")} style={{ transform: `scaleX(${fraction})` }} />
    </div>
  );
}
