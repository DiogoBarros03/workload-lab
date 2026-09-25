import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Op } from "@/lib/run";

const OPS: { op: Op; hint: string }[] = [
  { op: "read", hint: "GET /books/:id over 200 seeded books" },
  { op: "write", hint: "POST /books, unique ISBN each" },
  { op: "mixed", hint: "50 / 50" },
];

type Props = { value: Op; onChange: (op: Op) => void; disabled: boolean };

export function OpTabs({ value, onChange, disabled }: Props) {
  const hint = OPS.find((o) => o.op === value)?.hint;
  return (
    <div className="flex flex-col gap-2">
      <span id="op-label" className="text-sm text-muted-foreground">Operation</span>
      <Tabs value={value} onValueChange={(v) => onChange(v as Op)}>
        <TabsList aria-labelledby="op-label" className="w-full">
          {OPS.map(({ op }) => (
            <TabsTrigger key={op} value={op} disabled={disabled}>{op}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="font-mono text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}
