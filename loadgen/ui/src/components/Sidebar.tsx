import type { useTheme } from "@/hooks/use-theme";
import type { Project } from "@/lib/projects";
import type { StatusView } from "@/lib/status";
import { BookNav } from "./BookNav";
import { ThemeToggle } from "./ThemeToggle";
import { Wordmark } from "./Wordmark";

type Props = { active: Project | null; liveId: string | null; view: StatusView; theme: ReturnType<typeof useTheme> };

// Desktop only; below lg the MobileBar sheet carries the same list.
export function Sidebar({ active, liveId, view, theme }: Props) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[260px] flex-col gap-8 overflow-y-auto border-r bg-background px-4 py-8 lg:flex">
      <div className="px-3"><Wordmark /></div>
      <BookNav active={active} liveId={liveId} health={view.health} />
      <div className="mt-auto"><ThemeToggle theme={theme.theme} onCycle={theme.cycle} showLabel /></div>
    </aside>
  );
}
