import { useState } from "react";
import { List } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { useTheme } from "@/hooks/use-theme";
import { HOME_HREF, type Project } from "@/lib/projects";
import { pillsFor, type StatusView } from "@/lib/status";
import { BookNav } from "./BookNav";
import { ServicePill } from "./ServicePill";
import { ThemeToggle } from "./ThemeToggle";

type Props = { active: Project | null; view: StatusView; theme: ReturnType<typeof useTheme> };

export function MobileBar({ active, view, theme }: Props) {
  const [open, setOpen] = useState(false);
  const alerts = (active ? pillsFor(active, view.health) : []).filter((x) => x.state === "slow" || x.state === "down");
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-background px-4 py-2 lg:hidden">
      <a href={HOME_HREF} className="shrink-0 rounded-sm font-serif text-2xl text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring">Load lab</a>
      {/* The active project's slow and down services stay visible without opening the menu. */}
      <ul className="mr-2 ml-auto flex flex-wrap justify-end gap-2" aria-label="Services slow or down">
        {alerts.map((x) => <li key={x.service}><ServicePill pill={x} prefix={active?.id} /></li>)}
      </ul>
      <ThemeToggle theme={theme.theme} onCycle={theme.cycle} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" className="size-11 p-0" aria-label="Open project menu"><List weight="bold" className="size-5" /></Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] gap-6 overflow-y-auto px-4 py-6">
          <div className="px-3">
            <SheetTitle className="font-serif text-3xl font-normal text-ink">Load lab</SheetTitle>
            <SheetDescription className="mt-1 text-meta">One API, one database, real limits.</SheetDescription>
          </div>
          <BookNav active={active} health={view.health} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
