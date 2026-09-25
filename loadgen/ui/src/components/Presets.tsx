import { Button } from "@/components/ui/button";
import { fmtInt } from "@/lib/format";

const PRESETS = [
  { requests: 1000, concurrency: 10 },
  { requests: 10000, concurrency: 100 },
  { requests: 50000, concurrency: 500 },
];

type Props = { disabled: boolean; onPick: (p: { requests: number; concurrency: number }) => void };

export function Presets({ disabled, onPick }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">Presets</span>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p.requests} type="button" variant="outline" disabled={disabled} className="font-mono" onClick={() => onPick(p)}>
            {fmtInt(p.requests)} × {p.concurrency}
          </Button>
        ))}
      </div>
    </div>
  );
}
