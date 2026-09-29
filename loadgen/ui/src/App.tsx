import { useEffect } from "react";
import { MobileBar } from "@/components/MobileBar";
import { OutageBanner } from "@/components/OutageBanner";
import { Sidebar } from "@/components/Sidebar";
import { useHashRoute } from "@/hooks/use-hash-route";
import { useTheme } from "@/hooks/use-theme";
import { pageTitle } from "@/lib/books";
import { liveProject, projectOf, type Project } from "@/lib/projects";
import { useOperator } from "@/hooks/use-operator";
import { useStatus } from "@/hooks/use-status";
import { mergeOff } from "@/lib/operator";
import { isOutage } from "@/lib/status";
import { ProjectPage } from "@/pages/ProjectPage";
import { HomePage } from "@/pages/HomePage";
import { UpcomingPage } from "@/pages/UpcomingPage";

// Home polls no project, so no tree item shows pills there.
const idOf = (p: Project | null) => (p === null ? null : p.id);

export default function App() {
  const project = projectOf(useHashRoute());
  const live = liveProject(project);
  const liveId = idOf(live);
  // Home reads the compose target, loadgen's own default.
  const raw = useStatus(live?.target ?? "compose");
  const operator = useOperator(live);
  // Every consumer sees operator-stopped services as off, not down.
  const status = { ...raw, view: { ...raw.view, health: mergeOff(raw.view.health, operator.services) } };
  const theme = useTheme();
  const outage = isOutage(status.view);
  // The tab title carries the outage when the tab is in the background.
  useEffect(() => { document.title = pageTitle(project, outage); }, [project, outage]);
  return (
    <>
      <Sidebar active={project} liveId={liveId} view={status.view} theme={theme} />
      <MobileBar active={project} liveId={liveId} view={status.view} theme={theme} />
      <main className="lg:pl-[260px]">
        {/* Keyed so per-project state (history, run) starts fresh on navigation. */}
        <div key={project?.id ?? "home"} className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 sm:px-6 lg:gap-16 lg:py-16">
          <OutageBanner view={status.view} since={status.since} at={status.at} />
          {project === null ? <HomePage />
            : project.status === "ready" ? <ProjectPage project={project} status={status} operator={operator} />
            : <UpcomingPage project={project} />}
        </div>
      </main>
    </>
  );
}
