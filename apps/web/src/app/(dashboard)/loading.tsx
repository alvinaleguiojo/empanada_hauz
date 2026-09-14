import { Card } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="h-4 w-64 max-w-[70vw] animate-pulse rounded bg-foreground/10" />
          <div className="h-8 w-44 animate-pulse rounded bg-foreground/15" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded-lg bg-foreground/10" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="space-y-4">
            <div className="h-4 w-24 animate-pulse rounded bg-foreground/10" />
            <div className="h-8 w-32 animate-pulse rounded bg-foreground/15" />
            <div className="h-3 w-full animate-pulse rounded bg-foreground/10" />
          </Card>
        ))}
      </div>
      <Card className="space-y-3">
        <div className="h-5 w-40 animate-pulse rounded bg-foreground/15" />
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-lg bg-foreground/8" />
          ))}
        </div>
      </Card>
    </div>
  );
}
