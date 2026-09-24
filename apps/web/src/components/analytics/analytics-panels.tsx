import { Card } from "@/components/ui/card";
import { CustomerOriginMap } from "@/components/analytics/customer-origin-map";
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

export function AnalyticsPanels({ data, rangeLabel = "Today" }: { data: AnalyticsData; rangeLabel?: string }) {
  const rangeText = rangeLabel.toLowerCase();

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card className="min-w-0 overflow-hidden p-0 xl:min-h-[430px]">
          <div className="h-[3px] w-full bg-accent" />
          <div className="p-4 sm:p-5">
            <PanelHeader title="Revenue Trend" subtitle={`Completed sales, ${rangeText}`} />
            <BarTrend items={data.revenueTrend ?? []} tone="accent" valueFormatter={(value) => `Php ${formatCompact(value)}`} />
          </div>
        </Card>
        <Card className="min-w-0 overflow-hidden p-0 xl:min-h-[430px]">
          <div className="h-[3px] w-full bg-success" />
          <div className="p-4 sm:p-5">
            <PanelHeader title="Pieces Sold Trend" subtitle={`Completed sales, ${rangeText}`} />
            <BarTrend items={data.piecesTrend ?? []} tone="success" valueFormatter={(value) => `${formatCompact(value)} pcs`} />
          </div>
        </Card>
      </div>

      <CustomerOriginMap locations={data.topLocations ?? []} rangeLabel={rangeLabel} />

      <Card className="min-w-0 overflow-hidden p-0">
        <div className="h-[3px] w-full bg-accent" />
        <div className="p-4 sm:p-5">
          <PanelHeader title="Most Ordered Items" subtitle={`${rangeLabel}, completed orders`} />
          <RankedList
            emptyLabel="No completed item orders yet."
            items={(data.topItems ?? []).map((item) => ({
              label: item.name,
              value: item.quantity,
              valueLabel: `${item.quantity} pcs`
            }))}
            tone="accent"
          />
        </div>
      </Card>
    </div>
  );
}

function formatCompact(value: number) {
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 0, notation: value >= 10000 ? "compact" : "standard" }).format(value);
}
