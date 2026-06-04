import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TrendItem = {
  label: string;
  value: number;
};

type TopLocation = {
  location: string | null;
  _count?: {
    _all?: number;
  };
};

type TopItem = {
  name: string;
  quantity: number;
};

type AnalyticsData = {
  revenueTrend?: TrendItem[];
  piecesTrend?: TrendItem[];
  topLocations?: TopLocation[];
  topItems?: TopItem[];
};

export function AnalyticsPanels({ data }: { data: AnalyticsData }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-h-[330px] p-5">
          <PanelHeader title="Revenue Trend" subtitle="Completed sales, last 7 business days" />
          <BarTrend items={data.revenueTrend ?? []} tone="accent" valueFormatter={(value) => `Php ${formatCompact(value)}`} />
        </Card>
        <Card className="min-h-[330px] p-5">
          <PanelHeader title="Pieces Sold Trend" subtitle="Completed sales, last 7 business days" />
          <BarTrend items={data.piecesTrend ?? []} tone="success" valueFormatter={(value) => `${formatCompact(value)} pcs`} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
        <Card className="p-5">
          <PanelHeader title="Most Ordered Items" subtitle="Today, completed orders" />
          <RankedList
            emptyLabel="No completed item orders yet."
            items={(data.topItems ?? []).map((item) => ({
              label: item.name,
              value: item.quantity,
              valueLabel: `${item.quantity} pcs`
            }))}
            tone="accent"
          />
        </Card>

        <Card className="p-5">
          <PanelHeader title="Top Locations" subtitle="Today, scheduled or created orders" />
          <RankedList
            emptyLabel="No locations for today yet."
            items={(data.topLocations ?? []).map((item) => {
              const count = item._count?._all ?? 0;
              return {
                label: item.location ?? "Unknown",
                value: count,
                valueLabel: `${count} order${count === 1 ? "" : "s"}`
              };
            })}
            tone="success"
          />
        </Card>
      </div>
    </div>
  );
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-xs text-foreground/45">{subtitle}</p>
      </div>
    </div>
  );
}

function BarTrend({
  items,
  tone,
  valueFormatter
}: {
  items: TrendItem[];
  tone: "accent" | "success";
  valueFormatter: (value: number) => string;
}) {
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);

  if (items.length === 0) {
    return <EmptyState label="No trend data yet." />;
  }

  return (
    <div className="mt-6">
      <div className="flex h-48 items-end gap-2 rounded-lg border border-line/65 bg-black/[0.06] p-3">
        {items.map((item) => {
          const value = Number(item.value) || 0;
          const height = Math.max((value / max) * 100, value > 0 ? 8 : 2);
          return (
            <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
              <div className="flex min-h-0 flex-1 items-end">
                <div
                  title={`${item.label}: ${valueFormatter(value)}`}
                  className={cn(
                    "w-full rounded-md transition",
                    tone === "accent" ? "bg-accent shadow-[0_0_22px_rgb(var(--accent)/0.16)]" : "bg-success shadow-[0_0_22px_rgb(var(--success)/0.16)]"
                  )}
                  style={{ height: `${height}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-7 gap-2">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 text-center">
            <p className="truncate text-[11px] text-foreground/45">{item.label}</p>
            <p className="mt-1 truncate text-[11px] font-semibold text-foreground/70">{valueFormatter(Number(item.value) || 0)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankedList({
  items,
  emptyLabel,
  tone
}: {
  items: Array<{ label: string; value: number; valueLabel: string }>;
  emptyLabel: string;
  tone: "accent" | "success";
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  if (items.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }

  return (
    <div className="mt-5 space-y-3">
      {items.map((item, index) => {
        const width = Math.max((item.value / max) * 100, 6);
        return (
          <div key={`${item.label}-${index}`} className="rounded-lg border border-line/70 bg-black/[0.06] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground/88">{item.label}</p>
                <p className="mt-1 text-xs text-foreground/45">Rank {index + 1}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold">{item.valueLabel}</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={cn("h-full rounded-full", tone === "accent" ? "bg-accent" : "bg-success")} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="mt-5 flex min-h-40 items-center justify-center rounded-lg border border-dashed border-line/75 bg-black/[0.04] px-4 text-center">
      <p className="text-sm text-foreground/45">{label}</p>
    </div>
  );
}

function formatCompact(value: number) {
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 0, notation: value >= 10000 ? "compact" : "standard" }).format(value);
}
