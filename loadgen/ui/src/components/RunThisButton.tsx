import { Play } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useSecondClick } from "@/hooks/use-second-click";

type Props = { label: string; killedApi: boolean; disabled: boolean; onRun: () => void };

export const RiskNote = () => (
  <p role="status" className="max-w-[14rem] text-meta whitespace-normal text-red-fg">
    This run failed last time and will strain the api; it restarts on its own if killed.
  </p>
);

export function RunThisButton({ label, killedApi, disabled, onRun }: Props) {
  const { warned, click } = useSecondClick(killedApi, onRun);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`Run this: ${label}`} onClick={click}>
        <Play weight="bold" />Run this
      </Button>
      {warned && <RiskNote />}
    </div>
  );
}
