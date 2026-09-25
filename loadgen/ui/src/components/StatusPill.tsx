import { Tag } from "./Tag";

// Null means no status answer yet, which is neither up nor down.
export function StatusPill({ name, up }: { name?: string; up: boolean | null }) {
  const tone = up === null ? "neutral" : up ? "green" : "red";
  const word = up === null ? "unknown" : up ? "up" : "down";
  return (
    <Tag tone={tone}>
      {name && <span className="font-mono normal-case">{name} </span>}
      {word}
    </Tag>
  );
}
