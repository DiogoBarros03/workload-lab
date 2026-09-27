const W = 64;
const H = 18;

// The last 60 s as a 64×18 line; values above 1 rescale the whole line.
export function Sparkline({ x, y, values }: { x: number; y: number; values: number[] }) {
  if (values.length < 2) return null;
  const top = Math.max(1, ...values);
  const step = W / (values.length - 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(x + i * step).toFixed(1)} ${(y + H - (Math.max(0, v) / top) * H).toFixed(1)}`).join(" ");
  return <path d={d} fill="none" stroke="var(--ink-soft)" strokeWidth={1} strokeLinejoin="round" aria-hidden />;
}
