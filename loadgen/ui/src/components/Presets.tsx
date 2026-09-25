import { Button } from "@/components/ui/button";
import { fmtInt } from "@/lib/format";

export type Preset = { rps: number; durationSec: number };

const PRESETS: Preset[] = [
  { rps: 1, durationSec: 30 },
  { rps: 100, durationSec: 30 },
  { rps: 1000, durationSec: 30 },
  { rps: 3000, durationSec: 30 },
];

export function Presets({ disabled, onPick }: { disabled: boolean; onPick: (p: Preset) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">Presets</span>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p.rps} type="button" variant="outline" disabled={disabled} className="font-mono" onClick={() => onPick(p)}>
            {fmtInt(p.rps)} rps · {p.durationSec} s
          </Button>
        ))}
      </div>
    </div>
  );
}
