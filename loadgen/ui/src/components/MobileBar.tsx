import { useState } from "react";
import { List } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Container } from "@/hooks/use-status";
import type { Project } from "@/lib/projects";
import { ProjectNav } from "./ProjectNav";
import { StatusPills } from "./StatusPills";

export function MobileBar({ active, containers }: { active: Project; containers: Container[] | null }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-background px-4 py-2 lg:hidden">
      <p className="font-serif text-2xl text-ink">Load lab</p>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" className="size-11 p-0" aria-label="Open project menu"><List weight="bold" className="size-5" /></Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] gap-6 overflow-y-auto px-4 py-6">
          <div className="px-3">
            <SheetTitle className="font-serif text-3xl font-normal text-ink">Load lab</SheetTitle>
            <SheetDescription className="mt-1">One API, one database, real limits.</SheetDescription>
          </div>
          <ProjectNav active={active} onNavigate={() => setOpen(false)} />
          <div className="mt-auto px-3"><StatusPills containers={containers} /></div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
