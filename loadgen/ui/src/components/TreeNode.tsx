import type { ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const SUMMARY =
  "flex min-h-11 w-full cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden";

type Props = { open: boolean; onToggle: (open: boolean) => void; label: ReactNode; children: ReactNode; className?: string; summaryClassName?: string };

// One expandable sidebar row; native details gives keyboard and screen-reader behaviour.
export function TreeNode({ open, onToggle, label, children, className, summaryClassName }: Props) {
  return (
    <details open={open} onToggle={(e) => onToggle(e.currentTarget.open)} className={cn("group", className)}>
      <summary className={cn(SUMMARY, summaryClassName)}>
        <CaretRight weight="bold" aria-hidden className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
        {label}
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}
