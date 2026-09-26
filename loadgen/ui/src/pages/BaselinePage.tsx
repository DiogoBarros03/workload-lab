import { useRef, useState } from "react";
import baselineJson from "../../../../results/000-baseline.json";
import { AboutSection } from "@/components/AboutSection";
import { ContainersCard } from "@/components/ContainersCard";
import { ContainersControl } from "@/components/ContainersControl";
import { HistoryTable } from "@/components/HistoryTable";
import { LearningSection } from "@/components/LearningSection";
import { LiveCard } from "@/components/LiveCard";
import { MeasuredCard } from "@/components/MeasuredCard";
import { ProjectHeader } from "@/components/ProjectHeader";
import { ResultCard } from "@/components/ResultCard";
import { RunCard } from "@/components/RunCard";
import { useHistory } from "@/hooks/use-history";
import type { Operator } from "@/hooks/use-operator";
import { useRun } from "@/hooks/use-run";
import type { StatusState } from "@/hooks/use-status";
import { parseBaseline, runPresetFrom, type Run } from "@/lib/baseline";
import { LEARNING } from "@/lib/learning";
import { controllable } from "@/lib/operator";
import type { Project } from "@/lib/projects";
import { INITIAL_FORM, type RunForm } from "@/lib/run";
import { runWarning } from "@/lib/status";
import { cn } from "@/lib/utils";

const BASELINE = parseBaseline(baselineJson);

export function BaselinePage({ project, status, operator }: { project: Project; status: StatusState; operator: Operator }) {
  const history = useHistory(project.id);
  const { state: run, start, stop } = useRun(history.add);
  const [form, setForm] = useState<RunForm>(INITIAL_FORM);
  const runButton = useRef<HTMLButtonElement>(null);
  const running = run.phase === "running";
  const services = controllable(project);
  const blocked = services.some((s) => status.view.health[s] === "off");
  const runThis = (r: Run) => {
    const p = runPresetFrom(r, BASELINE.setup.durationSec);
    setForm({ op: p.op, rps: String(p.rps), duration: String(p.durationSec) });
    document.getElementById("run-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    runButton.current?.focus({ preventScroll: true });
  };
  return (
    <>
      <ProjectHeader project={project} />
      <AboutSection />
      <MeasuredCard baseline={BASELINE} running={running} onRun={runThis} />
      <LearningSection learning={LEARNING[project.id]} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
        <RunCard
          form={form} onForm={setForm} runRef={runButton}
          className={cn("lg:col-span-2", run.config !== null && "lg:row-span-2")}
          running={running} warning={runWarning(status.view)} onRun={start} onStop={stop} blocked={blocked}
          control={<ContainersControl operator={operator} services={services} running={running} />}
        />
        <ContainersCard status={status} className="lg:col-span-3" />
        <LiveCard run={run} className="lg:col-span-3" />
        <ResultCard result={run.result} className="lg:col-span-3 lg:col-start-3" />
      </div>
      <HistoryTable entries={history.entries} onClear={history.clear} />
    </>
  );
}
