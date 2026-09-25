import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type Props = { label: string; value: string; unit?: string; size?: "lg" | "md" };

// Re-keying on value gives a short tick; MotionConfig drops it for reduced motion.
export function Stat({ label, value, unit, size = "md" }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-ink", size === "lg" ? "text-4xl" : "text-2xl")}>
        <motion.span key={value} className="inline-block" initial={{ opacity: 0.4, y: -3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {value}
        </motion.span>
        {unit && <span className="ml-1 text-meta text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );
}
