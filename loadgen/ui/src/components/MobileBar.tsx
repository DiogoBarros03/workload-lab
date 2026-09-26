import { useState } from "react";
import { List } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Project } from "@/lib/projects";
import { SERVICES, type StatusView } from "@/lib/status";
import { BookNav } from "./BookNav";
import { StatusPill } from "./StatusPill";
import { StatusPills } from "./StatusPills";

export function MobileBar({ active, view }: { active: Project; view: StatusView }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-background px-4 py-2 lg:hidden">
      <p className="font-serif text-2xl text-ink">Load lab</p>
      {/* Slow and down services stay visible without opening the menu. */}
      <ul className="mr-2 ml-auto flex gap-2" aria-label="Services slow or down">
        {SERVICES.filter((s) => ["slow", "down"].includes(view.health[s])).map((s) => <li key={s}><StatusPill name={s} health={view.health[s]} /></li>)}
      </ul>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" className="size-11 p-0" aria-label="Open project menu"><List weight="bold" className="size-5" /></Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] gap-6 overflow-y-auto px-4 py-6">
          <div className="px-3">
            <SheetTitle className="font-serif text-3xl font-normal text-ink">Load lab</SheetTitle>
            <SheetDescription className="mt-1 text-meta">One API, one database, real limits.</SheetDescription>
          </div>
          <BookNav active={active} onNavigate={() => setOpen(false)} />
          <div className="mt-auto px-3"><StatusPills view={view} /></div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
