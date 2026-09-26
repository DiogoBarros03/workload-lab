import { hrefOf, type Project } from "@/lib/projects";
import { pillsFor, type Health, type Service } from "@/lib/status";
import { cn } from "@/lib/utils";
import { ServicePill } from "./ServicePill";

const LINK = "flex items-baseline gap-3 rounded-md px-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring";
type HealthMap = Record<Service, Health>;

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

// Sits under the link, aligned with the title; not part of the link's name.
function Pills({ p, health }: { p: Project; health: HealthMap }) {
  const pills = pillsFor(p, health);
  if (pills.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1 pr-3 pb-2 pl-[51px]" aria-label={`${p.title} services`}>
      {pills.map((x) => <li key={x.service}><ServicePill pill={x} /></li>)}
    </ul>
  );
}

function Item({ p, active, health, onNavigate }: { p: Project; active: boolean; health: HealthMap; onNavigate?: () => void }) {
  if (p.status === "upcoming") {
    return <a aria-disabled="true" className={cn(LINK, "border border-transparent text-muted-foreground")}><Body p={p} /></a>;
  }
  return (
    <div className={cn("rounded-md border", active ? "border-border bg-card text-ink" : "border-transparent text-ink-soft")}>
      <a href={hrefOf(p)} aria-current={active ? "page" : undefined} onClick={onNavigate} className={cn(LINK, !active && "hover:bg-accent")}>
        <Body p={p} />
      </a>
      <Pills p={p} health={health} />
    </div>
  );
}

// A book's projects, indented under it with a 1px rule marking the nesting.
export function ProjectNav({ projects, active, health, onNavigate }: { projects: readonly Project[]; active: Project | null; health: HealthMap; onNavigate?: () => void }) {
  return (
    <ul className="ml-3 flex flex-col gap-1 border-l pl-2">
      {projects.map((p) => <li key={p.id}><Item p={p} active={p === active} health={health} onNavigate={onNavigate} /></li>)}
    </ul>
  );
}
