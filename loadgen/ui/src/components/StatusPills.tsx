import type { Container } from "@/hooks/use-status";
import { StatusPill } from "./StatusPill";

const SERVICES = ["api", "db", "loadgen"] as const;

export function StatusPills({ containers }: { containers: Container[] | null }) {
  const upOf = (name: string) => containers?.find((c) => c.service === name)?.up ?? null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Container status">
      {SERVICES.map((s) => (
        <li key={s}>
          <StatusPill name={s} up={upOf(s)} />
        </li>
      ))}
    </ul>
  );
}
