import type { Container } from "@/hooks/use-status";
import { StatusPill } from "./StatusPill";

const SERVICES = ["api", "db", "loadgen"] as const;

export function Header({ containers }: { containers: Container[] | null }) {
  const upOf = (name: string) => containers?.find((c) => c.service === name)?.up ?? null;
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-serif text-5xl text-ink">Load lab</h1>
        <p className="mt-2 text-muted-foreground">One API, one database, real limits.</p>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Container status">
        {SERVICES.map((s) => (
          <li key={s}>
            <StatusPill name={s} up={upOf(s)} />
          </li>
        ))}
      </ul>
    </header>
  );
}
