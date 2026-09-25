import type { Container } from "@/hooks/use-status";
import type { Project } from "@/lib/projects";
import { ProjectNav } from "./ProjectNav";
import { StatusPills } from "./StatusPills";
import { Wordmark } from "./Wordmark";

// Desktop only; below lg the MobileBar sheet carries the same list.
export function Sidebar({ active, containers }: { active: Project; containers: Container[] | null }) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[260px] flex-col gap-8 overflow-y-auto border-r bg-background px-4 py-8 lg:flex">
      <div className="px-3"><Wordmark /></div>
      <ProjectNav active={active} />
      <div className="mt-auto px-3"><StatusPills containers={containers} /></div>
    </aside>
  );
}
