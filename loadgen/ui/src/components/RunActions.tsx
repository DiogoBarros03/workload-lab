import { ArrowCounterClockwise, Play, Stop } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

type Props = { runRef: React.Ref<HTMLButtonElement>; running: boolean; valid: boolean; resetBusy: boolean; onStop: () => void; onReset: () => void };

export function RunActions({ runRef, running, valid, resetBusy, onStop, onReset }: Props) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {running
        ? <Button type="button" className="sm:flex-1" onClick={onStop}><Stop weight="bold" />Stop</Button>
        : <Button ref={runRef} type="submit" className="sm:flex-1" disabled={!valid}><Play weight="bold" />Run</Button>}
      <Button type="button" variant="outline" disabled={running || resetBusy} onClick={onReset}>
        <ArrowCounterClockwise weight="bold" />Reset data
      </Button>
    </div>
  );
}
