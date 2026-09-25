import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { fmtInt, fromLog, SLIDER_MAX, toLog, validCount } from "@/lib/format";

type Props = {
  id: string; label: string; value: string; max: number; disabled: boolean; onChange: (v: string) => void;
  unit?: string; scale?: "log" | "linear";
};

// Log maps 0..SLIDER_MAX onto 1..max; linear uses the value itself.
const sliderOf = (scale: "log" | "linear", max: number) => scale === "log"
  ? { min: 0, max: SLIDER_MAX, to: (v: number) => toLog(v, max), from: (pos: number) => fromLog(pos, max) }
  : { min: 1, max, to: (v: number) => v, from: (pos: number) => pos };

// The input holds the exact value; the slider is a shortcut to it.
export function NumberField({ id, label, value, max, disabled, onChange, unit, scale = "log" }: Props) {
  const valid = validCount(value, max);
  const s = sliderOf(scale, max);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id} className="text-meta font-normal text-muted-foreground">{label}</Label>
        <span id={`${id}-range`} className="font-mono text-meta text-muted-foreground">1 – {fmtInt(max)}{unit && ` ${unit}`}</span>
      </div>
      <Input
        id={id} type="number" inputMode="numeric" min={1} max={max} step={1} required
        className="font-mono" value={value} disabled={disabled} aria-invalid={!valid} aria-describedby={`${id}-range`}
        onChange={(e) => onChange(e.target.value)}
      />
      <Slider
        aria-label={`${label}, ${scale} scale`} min={s.min} max={s.max} step={1} disabled={disabled}
        value={[valid ? s.to(+value) : s.min]}
        onValueChange={([pos]) => onChange(String(s.from(pos)))}
      />
    </div>
  );
}
