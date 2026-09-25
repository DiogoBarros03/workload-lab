import { hrefOf, PROJECTS, type Project } from "@/lib/projects";
import { cn } from "@/lib/utils";

const ITEM = "flex items-baseline gap-3 rounded-md border px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Body({ p }: { p: Project }) {
  return (
    <>
      <span className="font-mono text-meta">{p.id}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-meta">{p.title}</span>
        <span className="text-label text-muted-foreground">
          {p.chapter}
          {p.status === "upcoming" && <span className="ml-2 uppercase tracking-[0.05em]">upcoming</span>}
        </span>
      </span>
    </>
  );
}

function Item({ p, active, onNavigate }: { p: Project; active: boolean; onNavigate?: () => void }) {
  if (p.status === "upcoming") {
    return <a aria-disabled="true" className={cn(ITEM, "border-transparent text-muted-foreground")}><Body p={p} /></a>;
  }
  return (
    <a
      href={hrefOf(p)} aria-current={active ? "page" : undefined} onClick={onNavigate}
      className={cn(ITEM, active ? "border-border bg-card text-ink" : "border-transparent text-ink-soft hover:bg-accent")}
    >
      <Body p={p} />
    </a>
  );
}

export function ProjectNav({ active, onNavigate }: { active: Project; onNavigate?: () => void }) {
  return (
    <nav aria-label="Projects">
      <ul className="flex flex-col gap-1">
        {PROJECTS.map((p) => <li key={p.id}><Item p={p} active={p === active} onNavigate={onNavigate} /></li>)}
      </ul>
    </nav>
  );
}
