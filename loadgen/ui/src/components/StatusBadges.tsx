import { fmtInt, statusTone } from "@/lib/format";
import type { Result } from "@/lib/run";
import { Tag } from "./Tag";

export function StatusBadges({ result }: { result: Result }) {
  const codes = Object.entries(result.statusCounts).toSorted(([a], [b]) => a.localeCompare(b));
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Responses by status">
      {codes.map(([code, n]) => (
        <li key={code}><Tag tone={statusTone(code)} className="font-mono">{code} · {fmtInt(n)}</Tag></li>
      ))}
      {result.errors > 0 && (
        <li><Tag tone="red" className="font-mono">network · {fmtInt(result.errors)}</Tag></li>
      )}
    </ul>
  );
}
