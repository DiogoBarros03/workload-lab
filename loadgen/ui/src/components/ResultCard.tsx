import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtInt, fmtMs, fmtSec } from "@/lib/format";
import type { Result } from "@/lib/run";
import { Stat } from "./Stat";
import { StatusBadges } from "./StatusBadges";

const KEYS = ["p50", "p95", "p99", "max", "mean"] as const;

export function ResultCard({ result, className }: { result: Result | null; className?: string }) {
  if (!result) return null;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
      <Card className="h-full">
        <CardHeader><CardTitle>Result</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-6" aria-live="polite">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <Stat size="lg" label="req/s achieved" value={fmtInt(result.rps)} />
            <Stat size="lg" label="duration" value={fmtSec(result.durationMs)} />
            <Stat size="lg" label="requests" value={fmtInt(result.requests)} />
          </div>
          <div className="grid grid-cols-3 gap-6 sm:grid-cols-5">
            {KEYS.map((k) => <Stat key={k} label={k} value={fmtMs(result.latency?.[k] ?? null)} unit="ms" />)}
          </div>
          <StatusBadges result={result} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
