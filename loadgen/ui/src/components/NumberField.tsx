import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { fmtInt, fromLog, SLIDER_MAX, toLog, validCount } from "@/lib/format";

type Props = { id: string; label: string; value: string; max: number; disabled: boolean; onChange: (v: string) => void };

// The input holds the exact value; the slider is a log-scale shortcut to it.
export function NumberField({ id, label, value, max, disabled, onChange }: Props) {
  const valid = validCount(value, max);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id} className="text-sm font-normal text-muted-foreground">{label}</Label>
        <span id={`${id}-range`} className="font-mono text-xs text-muted-foreground">1 – {fmtInt(max)}</span>
      </div>
      <Input
        id={id} type="number" inputMode="numeric" min={1} max={max} step={1} required
        className="font-mono" value={value} disabled={disabled} aria-invalid={!valid} aria-describedby={`${id}-range`}
        onChange={(e) => onChange(e.target.value)}
      />
      <Slider
        aria-label={`${label}, log scale`} min={0} max={SLIDER_MAX} step={1} disabled={disabled}
        value={[valid ? toLog(+value, max) : 0]}
        onValueChange={([pos]) => onChange(String(fromLog(pos, max)))}
      />
    </div>
  );
}
