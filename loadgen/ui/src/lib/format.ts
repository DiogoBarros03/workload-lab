const THIN = " ";

export const fmtInt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, THIN);

// Null means no sample in that window: shown as a dash, not zero.
export function fmtMs(ms: number | null): string {
  if (ms === null) return "–";
  if (ms < 10) return ms.toFixed(2);
  if (ms < 100) return ms.toFixed(1);
  return fmtInt(ms);
}

// Outage durations: whole seconds, minutes once past one.
export function fmtDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} s`;
  return `${Math.floor(sec / 60)} m ${String(sec % 60).padStart(2, "0")} s`;
}

export const fmtSec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const UNITS = ["B", "KiB", "MiB", "GiB"];

export function fmtBytes(bytes: number): string {
  const i = Math.min(UNITS.length - 1, Math.max(0, Math.floor(Math.log2(Math.max(bytes, 1)) / 10)));
  return `${+(bytes / 1024 ** i).toFixed(1)} ${UNITS[i]}`;
}

export type Tone = "green" | "blue" | "yellow" | "red";

export function statusTone(code: string): Tone {
  if (code.startsWith("2")) return "green";
  if (code.startsWith("3")) return "blue";
  if (code.startsWith("4")) return "yellow";
  return "red";
}

// Slider positions 0..1000 on a log scale, so 1 and 200 000 are both reachable.
export const SLIDER_MAX = 1000;
export const toLog = (value: number, max: number) => Math.round((Math.log(value) / Math.log(max)) * SLIDER_MAX);
export const fromLog = (pos: number, max: number) =>
  Math.min(max, Math.max(1, Math.round(Math.exp((pos / SLIDER_MAX) * Math.log(max)))));

// Whole numbers only: the server schema rejects fractions and exponents.
export const validCount = (v: string, max: number) => /^\d+$/.test(v) && +v >= 1 && +v <= max;

export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
