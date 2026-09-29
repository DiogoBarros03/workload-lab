import { useRef, useState } from "react";
import baselineJson from "../../../../results/000-baseline.json";
import { ContainersControl } from "@/components/ContainersControl";
import { HistoryTable } from "@/components/HistoryTable";
import { LiveArchDiagram } from "@/components/LiveArchDiagram";
import { LiveCard } from "@/components/LiveCard";
import { MeasuredCard } from "@/components/MeasuredCard";
import { PathNav } from "@/components/PathNav";
import { ProjectHeader } from "@/components/ProjectHeader";
import { Prose, ProseSection, Section } from "@/components/ProseSection";
import { QuickTests } from "@/components/QuickTests";
import { ResultCard } from "@/components/ResultCard";
import { RunCard } from "@/components/RunCard";
import { SummarySection } from "@/components/SummarySection";
import { useHistory } from "@/hooks/use-history";
import type { Operator } from "@/hooks/use-operator";
import { useRun } from "@/hooks/use-run";
import type { StatusState } from "@/hooks/use-status";
import { parseBaseline, runPresetFrom, type Run } from "@/lib/baseline";
import { LESSONS, type Lesson, type QuickTest } from "@/lib/learning";
import { controllable } from "@/lib/operator";
import type { Project } from "@/lib/projects";
import { INITIAL_FORM, type RunForm } from "@/lib/run";
import { runWarning } from "@/lib/status";

const BASELINE = parseBaseline(baselineJson);

// A ready project must carry its whole lecture; a gap is a data bug.
function built({ handsOn, changed, learned }: Lesson) {
  if (handsOn === null || changed === null || learned === null) throw new Error("a ready project needs hands-on, changed and learned prose");
  return { handsOn, changed, learned };
}

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
  const quickRun = (q: QuickTest) => {
    setForm({ op: q.op, rps: String(q.rps), duration: String(q.durationSec) });
    void start({ mode: "open", op: q.op, rps: q.rps, durationSec: q.durationSec });
  };
  const lesson = LESSONS[project.id];
  const { handsOn, changed, learned } = built(lesson);
  return (
    <>
      <ProjectHeader project={project} />
      <ProseSection id="story" title="The Story So Far" paragraphs={lesson.story} />
      <Section id="hands-on" title="Hands-On">
        <Prose paragraphs={[handsOn]} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
          <div className="min-w-0 lg:col-span-5">
            <LiveArchDiagram architecture={lesson.architecture} run={run} status={status} health={status.view.health} />
          </div>
          <RunCard
            form={form} onForm={setForm} runRef={runButton} className="lg:col-span-2"
            running={running} warning={runWarning(status.view)} onRun={start} onStop={stop} blocked={blocked}
            control={<>
              <ContainersControl operator={operator} services={services} running={running} />
              <QuickTests quick={lesson.quick} baseline={BASELINE} disabled={running || blocked} onRun={quickRun} />
            </>}
          />
          <LiveCard run={run} className="min-w-0 lg:col-span-3" />
        </div>
        <ResultCard result={run.result} />
        <MeasuredCard baseline={BASELINE} quick={lesson.quick} running={running} onRun={runThis} />
        <HistoryTable entries={history.entries} onClear={history.clear} />
      </Section>
      <ProseSection id="changed" title="What We Changed" paragraphs={changed} />
      <ProseSection id="learned" title="What We Learned" paragraphs={learned} />
      <SummarySection lesson={lesson} />
      <PathNav project={project} />
    </>
  );
}
