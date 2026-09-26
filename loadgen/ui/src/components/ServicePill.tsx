import type { Pill } from "@/lib/status";
import { Tag } from "./Tag";

const TONE = { up: "green", slow: "yellow", down: "red", unknown: "neutral" } as const;

// One service's health; the word backs the colour, the aria-label reads as a sentence.
export function ServicePill({ pill, prefix }: { pill: Pill; prefix?: string }) {
  const text = prefix ? `${prefix} · ${pill.label}` : pill.label;
  return (
    <span role="img" aria-label={prefix ? `${prefix} ${pill.ariaLabel}` : pill.ariaLabel}>
      <Tag tone={TONE[pill.state]} className="font-mono normal-case tracking-normal">{text}</Tag>
    </span>
  );
}
