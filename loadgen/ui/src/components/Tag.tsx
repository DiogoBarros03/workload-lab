import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/lib/format";
import { cn } from "@/lib/utils";

const tones: Record<Tone | "neutral", string> = {
  green: "bg-green-bg text-green-fg",
  blue: "bg-blue-bg text-blue-fg",
  yellow: "bg-yellow-bg text-yellow-fg",
  red: "bg-red-bg text-red-fg",
  neutral: "bg-accent text-muted-foreground",
};

export function Tag({ tone, children, className }: { tone: Tone | "neutral"; children: React.ReactNode; className?: string }) {
  return (
    <Badge className={cn("uppercase tracking-[0.05em]", tones[tone], className)}>
      {children}
    </Badge>
  );
}
