import { MobileBar } from "@/components/MobileBar";
import { Sidebar } from "@/components/Sidebar";
import { useHashRoute } from "@/hooks/use-hash-route";
import { useStatus } from "@/hooks/use-status";
import { BaselinePage } from "@/pages/BaselinePage";
import { UpcomingPage } from "@/pages/UpcomingPage";

export default function App() {
  const project = useHashRoute();
  const status = useStatus();
  return (
    <>
      <Sidebar active={project} containers={status.containers} />
      <MobileBar active={project} containers={status.containers} />
      <main className="lg:pl-[260px]">
        {/* Keyed so per-project state (history, run) starts fresh on navigation. */}
        <div key={project.id} className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6 lg:gap-16 lg:py-16">
          {project.status === "ready"
            ? <BaselinePage project={project} status={status} />
            : <UpcomingPage project={project} />}
        </div>
      </main>
    </>
  );
}
