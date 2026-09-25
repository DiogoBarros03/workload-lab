import { ProjectHeader } from "@/components/ProjectHeader";
import { Card, CardContent } from "@/components/ui/card";
import type { Project } from "@/lib/projects";

export function UpcomingPage({ project }: { project: Project }) {
  return (
    <>
      <ProjectHeader project={project} />
      <Card><CardContent className="text-muted-foreground">Not built yet. See the roadmap in README.md.</CardContent></Card>
    </>
  );
}
