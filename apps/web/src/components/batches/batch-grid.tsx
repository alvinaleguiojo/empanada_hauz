import { Card } from "@/components/ui/card";

export function BatchGrid({ batches }: { batches: Array<any> }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {batches.map((batch) => (
        <Card key={batch.id}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-semibold capitalize">{batch.name}</h3>
              <p className="text-sm text-foreground/55">
                {batch.currentCapacity}/{batch.maxCapacity} used
              </p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{batch.isClosed ? "Closed" : "Open"}</span>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min((batch.currentCapacity / batch.maxCapacity) * 100, 100)}%` }}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
