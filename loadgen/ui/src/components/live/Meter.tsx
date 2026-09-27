import type { LoadTone } from "@/lib/status";

const TONE_FILL: Record<LoadTone, string> = {
  fill: "var(--bar-fill)", warn: "var(--bar-warn)", hot: "var(--bar-hot)", muted: "var(--ink-muted)",
};

// A 4px track with a fill whose colour follows the load tone.
export function Meter({ x, y, w, ratio, tone }: { x: number; y: number; w: number; ratio: number | null; tone: LoadTone }) {
  const fill = w * Math.min(1, Math.max(0, ratio ?? 0));
  return (
    <g aria-hidden>
      <rect x={x} y={y} width={w} height={4} rx={2} fill="var(--track)" />
      <rect x={x} y={y} width={fill} height={4} rx={2} style={{ width: fill, fill: TONE_FILL[tone], transition: "width 200ms, fill 200ms" }} />
    </g>
  );
}
