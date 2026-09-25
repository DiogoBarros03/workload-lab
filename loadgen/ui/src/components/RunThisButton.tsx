import { Play } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = { label: string; killedApi: boolean; disabled: boolean; onRun: () => void };

// Runs that OOM-killed the api ask for a second click, inline, no modal.
export function RunThisButton({ label, killedApi, disabled, onRun }: Props) {
  const [warned, setWarned] = useState(false);
  const click = () => {
    if (killedApi && !warned) return setWarned(true);
    setWarned(false);
    onRun();
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`Run this: ${label}`} onClick={click}>
        <Play weight="bold" />Run this
      </Button>
      {warned && (
        <p role="status" className="max-w-[14rem] text-meta whitespace-normal text-red-fg">
          This run killed the api last time; it restarts on its own now.
        </p>
      )}
    </div>
  );
}
