import type { Project } from "@/lib/projects";

export function ProjectHeader({ project, children }: { project: Project; children?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <p className="font-mono text-sm text-muted-foreground">{project.id} · {project.title} · {project.chapter}</p>
      <h1 className="font-serif text-3xl text-ink sm:text-4xl">{project.question}</h1>
      {children && <p className="max-w-3xl text-muted-foreground">{children}</p>}
    </header>
  );
}
