import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatusState } from "@/hooks/use-status";
import { ContainerRow } from "./ContainerRow";
import { CpuChart } from "./CpuChart";
import { DbChart } from "./DbChart";

export function ContainersCard({ status, className }: { status: StatusState; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Containers</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {status.error && <p className="rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">Status unavailable: {status.error}</p>}
        {status.containers === null && !status.error && <p className="text-sm text-muted-foreground">Loading status.</p>}
        {status.containers && (
          <ul className="divide-y divide-border">
            {status.containers.map((c) => <ContainerRow key={c.service} c={c} />)}
          </ul>
        )}
        <CpuChart samples={status.apiCpu} />
        <DbChart samples={status.dbLoad} />
      </CardContent>
    </Card>
  );
}
