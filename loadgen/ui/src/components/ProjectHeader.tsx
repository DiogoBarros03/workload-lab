import { breadcrumbOf } from "@/lib/books";
import type { Project } from "@/lib/projects";

export function ProjectHeader({ project, children }: { project: Project; children?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <p className="text-label text-muted-foreground">{breadcrumbOf(project)}</p>
      <p className="font-mono text-meta text-muted-foreground">{project.id} · {project.title} · {project.chapter}</p>
      <h1 className="font-serif text-question-sm text-ink sm:text-question">{project.question}</h1>
      {children && <p className="max-w-prose text-muted-foreground">{children}</p>}
    </header>
  );
}
