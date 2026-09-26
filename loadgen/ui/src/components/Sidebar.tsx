import type { Project } from "@/lib/projects";
import type { StatusView } from "@/lib/status";
import { BookNav } from "./BookNav";
import { Wordmark } from "./Wordmark";

// Desktop only; below lg the MobileBar sheet carries the same list.
export function Sidebar({ active, view }: { active: Project; view: StatusView }) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[260px] flex-col gap-8 overflow-y-auto border-r bg-background px-4 py-8 lg:flex">
      <div className="px-3"><Wordmark /></div>
      <BookNav active={active} health={view.health} />
    </aside>
  );
}
