import { SERVICES, type StatusView } from "@/lib/status";
import { StatusPill } from "./StatusPill";

export function StatusPills({ view }: { view: StatusView }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Container status">
      {SERVICES.map((s) => (
        <li key={s}>
          <StatusPill name={s} health={view.health[s]} />
        </li>
      ))}
    </ul>
  );
}
