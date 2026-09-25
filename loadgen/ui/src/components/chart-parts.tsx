import type { DotItemDotProps } from "recharts";

const TICK = { fill: "var(--ink-muted)", fontSize: 11, fontFamily: "var(--font-mono)" };

// Shared axis look: mono ticks, no axis line, short tick marks.
export const AXIS = { tick: TICK, tickLine: { stroke: "var(--line)" }, axisLine: false, tickSize: 4 } as const;

export const GRID = { stroke: "var(--chart-grid)", strokeDasharray: "3 3", vertical: false } as const;

export const REF_LABEL = { ...TICK, fill: "var(--chart-ref)" };

// Red dot on points whose flag key is true; nothing elsewhere.
export const flagDot = (flag: string) => (p: DotItemDotProps) =>
  p.payload[flag] && p.cx != null && p.cy != null
    ? <circle key={p.index} cx={p.cx} cy={p.cy} r={3} fill="var(--chart-error)" stroke="var(--card)" strokeWidth={1} />
    : null;

// Recharts drops axes on empty data; one valueless row keeps them drawn.
export const orBlank = <T,>(data: T[]) => (data.length > 0 ? data : [{ t: 0 }]);

// Axes stay drawn when empty; the label says why there is no line.
export function Waiting({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-xs text-muted-foreground">
      waiting for data
    </p>
  );
}

export function Key({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return <span className="flex items-center gap-2">{swatch}{children}</span>;
}

export const lineSwatch = (color: string, dashed = false) => (
  <span aria-hidden className={`h-0 w-4 border-t-2 ${dashed ? "border-dashed" : ""}`} style={{ borderColor: color }} />
);

export const dotSwatch = <span aria-hidden className="size-2 rounded-full" style={{ background: "var(--chart-error)" }} />;
