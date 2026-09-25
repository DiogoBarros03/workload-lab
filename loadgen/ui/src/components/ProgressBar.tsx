// Fraction is 0..1; exposed to assistive tech as a percentage.
export function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.round(fraction * 100);
  return (
    <div role="progressbar" aria-label="Run progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1 w-full overflow-hidden rounded-sm bg-track">
      <div className="h-full origin-left bg-fill transition-transform duration-300" style={{ transform: `scaleX(${fraction})` }} />
    </div>
  );
}
