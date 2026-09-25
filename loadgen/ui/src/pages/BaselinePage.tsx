import { ContainersCard } from "@/components/ContainersCard";
import { HistoryTable } from "@/components/HistoryTable";
import { LiveCard } from "@/components/LiveCard";
import { ProjectHeader } from "@/components/ProjectHeader";
import { ResultCard } from "@/components/ResultCard";
import { RunCard } from "@/components/RunCard";
import { useHistory } from "@/hooks/use-history";
import { useRun } from "@/hooks/use-run";
import type { StatusState } from "@/hooks/use-status";
import type { Project } from "@/lib/projects";
import { runWarning } from "@/lib/status";
import { cn } from "@/lib/utils";

export function BaselinePage({ project, status }: { project: Project; status: StatusState }) {
  const history = useHistory(project.id);
  const { state: run, start, stop } = useRun(history.add);
  return (
    <>
      <ProjectHeader project={project}>
        One Fastify container (0.5 CPU, 128 MiB) and one Postgres container. Requests arrive at a fixed rate whether
        or not earlier ones finished; in-flight is what the system could not keep up with.
      </ProjectHeader>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
        <RunCard
          className={cn("lg:col-span-2", run.config !== null && "lg:row-span-2")}
          running={run.phase === "running"} warning={runWarning(status.view)} onRun={start} onStop={stop}
        />
        <ContainersCard status={status} className="lg:col-span-3" />
        <LiveCard run={run} className="lg:col-span-3" />
        <ResultCard result={run.result} className="lg:col-span-3 lg:col-start-3" />
      </div>
      <HistoryTable entries={history.entries} onClear={history.clear} />
    </>
  );
}
