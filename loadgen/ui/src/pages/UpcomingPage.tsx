import { LearningSection } from "@/components/LearningSection";
import { ProjectHeader } from "@/components/ProjectHeader";
import { LEARNING } from "@/lib/learning";
import type { Project } from "@/lib/projects";

export function UpcomingPage({ project }: { project: Project }) {
  return (
    <>
      <ProjectHeader project={project} />
      <LearningSection learning={LEARNING[project.id]} />
    </>
  );
}
