import { ContainersCard } from "@/components/ContainersCard";
import { Header } from "@/components/Header";
import { HistoryTable } from "@/components/HistoryTable";
import { LiveCard } from "@/components/LiveCard";
import { ResultCard } from "@/components/ResultCard";
import { RunCard } from "@/components/RunCard";
import { useHistory } from "@/hooks/use-history";
import { useRun } from "@/hooks/use-run";
import { useStatus } from "@/hooks/use-status";
import { cn } from "@/lib/utils";

export default function App() {
  const status = useStatus();
  const history = useHistory();
  const { state: run, start, stop } = useRun(history.add);
  const live = run.config !== null;
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-12 sm:px-6 lg:gap-16 lg:py-20">
      <Header containers={status.containers} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <RunCard
          className={cn(live && "lg:row-span-2")}
          running={run.phase === "running"} runError={run.message} onRun={start} onStop={stop}
        />
        <ContainersCard status={status} className="lg:col-span-2" />
        <LiveCard run={run} className="lg:col-span-2" />
        <ResultCard result={run.result} className="lg:col-span-2 lg:col-start-2" />
      </div>
      <HistoryTable entries={history.entries} onClear={history.clear} />
    </main>
  );
}
