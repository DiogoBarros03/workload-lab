import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { neighboursOf } from "@/lib/books";
import { HOME_HREF, hrefOf, type Project } from "@/lib/projects";
import { cn } from "@/lib/utils";

const BOX = "flex min-h-11 min-w-0 flex-col gap-2 rounded-lg border border-border p-5";
const LINK = "bg-card outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] motion-reduce:transition-none";

type Card = { href: string; label: string; id?: string; title: string; question: string; next: boolean };

// A whole-card link to one step of the path; next cards align right.
export function PathCard({ href, label, id, title, question, next }: Card) {
  const Arrow = next ? ArrowRight : ArrowLeft;
  return (
    <a href={href} aria-label={`${label}: ${id ? `${id} ` : ""}${title}`} className={cn(BOX, LINK, next && "items-end text-right")}>
      <span className={cn("flex items-center gap-1.5 text-label text-muted-foreground", next && "flex-row-reverse")}>
        <Arrow weight="bold" aria-hidden className="size-3.5" />{label}
      </span>
      <span className={cn("flex max-w-full flex-wrap items-baseline gap-x-2", next && "justify-end")}>
        {id && <span className="font-mono text-meta text-muted-foreground">{id}</span>}
        <span className="font-serif text-xl text-ink">{title}</span>
      </span>
      <span className="w-full truncate text-meta text-muted-foreground">{question}</span>
    </a>
  );
}

const toCard = (p: Project, label: string, next: boolean): Card =>
  ({ href: hrefOf(p), label, id: p.id, title: p.title, question: p.question, next });

// Previous and next steps of the book, with home and the end as bookends.
export function PathNav({ project }: { project: Project }) {
  const { prev, next } = neighboursOf(project);
  return (
    <nav aria-label="Learning path" className="grid grid-cols-1 gap-4 border-t border-border pt-12 md:grid-cols-2">
      <PathCard {...(prev ? toCard(prev, "Previous", false) : { href: HOME_HREF, label: "Start", title: "Load lab", question: "Back to the home page.", next: false })} />
      {next ? <PathCard {...toCard(next, "Next", true)} /> : (
        <div className={cn(BOX, "items-end text-right text-muted-foreground")}>
          <span className="text-label">End</span>
          <span className="font-serif text-xl">End of the book</span>
          <span className="text-meta">What did we learn across all twelve?</span>
        </div>
      )}
    </nav>
  );
}
