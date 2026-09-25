import { WarningCircle } from "@phosphor-icons/react";
import { fmtDuration } from "@/lib/format";
import { outageMessages, type StatusView } from "@/lib/status";

const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB");

// Not dismissible: it leaves when the services are healthy again.
// at is the latest poll, so the duration advances with each poll.
export function OutageBanner({ view, since, at }: { view: StatusView; since: number | null; at: number }) {
  const messages = outageMessages(view);
  return (
    <div role="alert" aria-live="polite" className="empty:hidden">
      {messages.length > 0 && since !== null && (
        <div className="flex gap-3 rounded-lg border border-red-fg/25 bg-red-bg px-4 py-3 text-red-fg">
          <WarningCircle weight="bold" aria-hidden className="mt-1 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            {messages.map((m) => <p key={m} className="text-sm font-medium">{m}</p>)}
            <p className="font-mono text-xs">first seen {clock(since)} · for {fmtDuration(at - since)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
