import { House } from "@phosphor-icons/react";
import { HOME_HREF } from "@/lib/projects";
import { cn } from "@/lib/utils";

// Sits above the catalogue; aligned with the category rows below it.
export function HomeLink({ active, onNavigate }: { active: boolean; onNavigate?: () => void }) {
  return (
    <a
      href={HOME_HREF} aria-current={active ? "page" : undefined} onClick={onNavigate}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-label outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-border bg-card text-ink" : "border-transparent text-muted-foreground hover:bg-accent",
      )}
    >
      <House weight="bold" aria-hidden className="size-3.5 shrink-0" />
      Home
    </a>
  );
}
