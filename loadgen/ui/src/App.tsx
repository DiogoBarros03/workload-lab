import { useEffect } from "react";
import { MobileBar } from "@/components/MobileBar";
import { OutageBanner } from "@/components/OutageBanner";
import { Sidebar } from "@/components/Sidebar";
import { useHashRoute } from "@/hooks/use-hash-route";
import { useTheme } from "@/hooks/use-theme";
import { pageTitle } from "@/lib/books";
import { projectOf } from "@/lib/projects";
import { useStatus } from "@/hooks/use-status";
import { isOutage } from "@/lib/status";
import { BaselinePage } from "@/pages/BaselinePage";
import { HomePage } from "@/pages/HomePage";
import { UpcomingPage } from "@/pages/UpcomingPage";

export default function App() {
  const project = projectOf(useHashRoute());
  const status = useStatus();
  const theme = useTheme();
  const outage = isOutage(status.view);
  // The tab title carries the outage when the tab is in the background.
  useEffect(() => { document.title = pageTitle(project, outage); }, [project, outage]);
  return (
    <>
      <Sidebar active={project} view={status.view} theme={theme} />
      <MobileBar active={project} view={status.view} theme={theme} />
      <main className="lg:pl-[260px]">
        {/* Keyed so per-project state (history, run) starts fresh on navigation. */}
        <div key={project?.id ?? "home"} className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 sm:px-6 lg:gap-16 lg:py-16">
          <OutageBanner view={status.view} since={status.since} at={status.at} />
          {project === null ? <HomePage />
            : project.status === "ready" ? <BaselinePage project={project} status={status} />
            : <UpcomingPage project={project} />}
        </div>
      </main>
    </>
  );
}
