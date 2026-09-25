export function ProgressBar({ done, total }: { done: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div role="progressbar" aria-label="Run progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="h-1 w-full overflow-hidden rounded-sm bg-track">
      <div className="h-full origin-left bg-fill transition-transform duration-300" style={{ transform: `scaleX(${ratio})` }} />
    </div>
  );
}
