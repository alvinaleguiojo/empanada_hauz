import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AnalyticsPanels({ data }: { data: any }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <PanelHeader title="Revenue Trend" subtitle="Completed sales, last 7 business days" />
        <BarTrend items={data.revenueTrend ?? []} tone="accent" prefix="Php " />
      </Card>
      <Card>
        <PanelHeader title="Pieces Sold Trend" subtitle="Completed sales, last 7 business days" />
        <BarTrend items={data.piecesTrend ?? []} tone="success" />
      </Card>
      <Card>
        <PanelHeader title="Top Locations" subtitle="Today" />
        <div className="mt-4 space-y-2">
          {(data.topLocations ?? []).length === 0 ? <p className="text-sm text-foreground/45">No locations for today yet.</p> : null}
          {(data.topLocations ?? []).map((item: any, index: number) => {
            const count = item._count?._all ?? 0;
            return (
              <div key={index} className="flex items-start justify-between gap-3 rounded-lg border border-line/75 bg-black/[0.06] px-3 py-2.5">
                <span className="line-clamp-2 text-sm font-medium text-foreground/82">{item.location ?? "Unknown"}</span>
                <span className="rounded-md bg-white/[0.08] px-2 py-1 text-xs font-semibold">{count}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-foreground/45">{subtitle}</p>
    </div>
  );
}

function BarTrend({
  items,
  tone,
  prefix = ""
}: {
  items: Array<{ label: string; value: number }>;
  tone: "accent" | "success";
  prefix?: string;
}) {
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);

  return (
    <div className="mt-5 flex h-48 items-end gap-2">
      {items.length === 0 ? <p className="self-start text-sm text-foreground/45">No trend data yet.</p> : null}
      {items.map((item) => {
        const value = Number(item.value) || 0;
        const height = Math.max((value / max) * 100, value > 0 ? 8 : 2);
        return (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-36 w-full items-end rounded-md bg-black/[0.08] p-1">
              <div
                title={`${item.label}: ${prefix}${value}`}
                className={cn("w-full rounded", tone === "accent" ? "bg-accent/80" : "bg-success/80")}
                style={{ height: `${height}%` }}
              />
            </div>
            <p className="truncate text-[11px] text-foreground/45">{item.label}</p>
          </div>
        );
      })}
    </div>
  );
}
