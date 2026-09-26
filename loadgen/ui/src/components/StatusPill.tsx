import { Hourglass, WarningCircle } from "@phosphor-icons/react";
import type { Health } from "@/lib/status";
import { Tag } from "./Tag";

const TONE = { up: "green", slow: "yellow", down: "red", unknown: "neutral", off: "neutral" } as const;
const WORD = { up: "up", slow: "slow", down: "error", unknown: "unknown", off: "off" } as const;

export function StatusPill({ name, health }: { name?: string; health: Health }) {
  return (
    <Tag tone={TONE[health]}>
      {health === "down" && <WarningCircle weight="bold" aria-hidden />}
      {health === "slow" && <Hourglass weight="bold" aria-hidden />}
      {name && <span className="font-mono normal-case">{name}</span>}
      {WORD[health]}
    </Tag>
  );
}
