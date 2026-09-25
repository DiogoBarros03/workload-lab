// A thin flat bar; scaleX keeps updates on the compositor.
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = Math.min(1, Math.max(0, value / max));
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-1 w-full overflow-hidden rounded-sm bg-track">
      <div className="h-full origin-left bg-fill transition-transform duration-500" style={{ transform: `scaleX(${ratio})` }} />
    </div>
  );
}
