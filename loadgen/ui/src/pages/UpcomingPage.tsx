import { PathNav } from "@/components/PathNav";
import { ProjectHeader } from "@/components/ProjectHeader";
import { ProseSection } from "@/components/ProseSection";
import { SummarySection } from "@/components/SummarySection";
import { LESSONS } from "@/lib/learning";
import type { Project } from "@/lib/projects";

export function UpcomingPage({ project }: { project: Project }) {
  const lesson = LESSONS[project.id];
  return (
    <>
      <ProjectHeader project={project} />
      <ProseSection id="story" title="The Story So Far" paragraphs={lesson.story} />
      <p className="max-w-prose text-muted-foreground">Hands-on, findings and summary arrive when this project is built.</p>
      <SummarySection lesson={lesson} />
      <PathNav project={project} />
    </>
  );
}
