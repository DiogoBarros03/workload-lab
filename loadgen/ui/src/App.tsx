import { useEffect } from "react";
import { MobileBar } from "@/components/MobileBar";
import { OutageBanner } from "@/components/OutageBanner";
import { Sidebar } from "@/components/Sidebar";
import { useHashRoute } from "@/hooks/use-hash-route";
import { useStatus } from "@/hooks/use-status";
import { isOutage } from "@/lib/status";
import { BaselinePage } from "@/pages/BaselinePage";
import { UpcomingPage } from "@/pages/UpcomingPage";

export default function App() {
  const project = useHashRoute();
  const status = useStatus();
  const outage = isOutage(status.view);
  // The tab title carries the outage when the tab is in the background.
  useEffect(() => { document.title = outage ? "ERROR · Load lab" : "Load lab"; }, [outage]);
  return (
    <>
      <Sidebar active={project} view={status.view} />
      <MobileBar active={project} view={status.view} />
      <main className="lg:pl-[260px]">
        {/* Keyed so per-project state (history, run) starts fresh on navigation. */}
        <div key={project.id} className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6 lg:gap-16 lg:py-16">
          <OutageBanner view={status.view} since={status.since} at={status.at} />
          {project.status === "ready"
            ? <BaselinePage project={project} status={status} />
            : <UpcomingPage project={project} />}
        </div>
      </main>
    </>
  );
}
