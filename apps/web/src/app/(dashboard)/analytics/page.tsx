import { AnalyticsPanels } from "@/components/analytics/analytics-panels";
import { StatCard } from "@/components/dashboard/stat-card";
import { apiFetch } from "@/lib/api";

type AnalyticsOverview = {
  revenueToday: number;
  pcsSoldToday: number;
  averageOrderSize: number;
  repeatCustomerRate: number;
  cancelledOrders: number;
  productionEfficiency: number;
  ordersToday: number;
  activeOrdersToday: number;
  topLocations: Array<{ location: string | null; _count?: { _all?: number } }>;
  topItems: Array<{ name: string; quantity: number }>;
  revenueTrend: Array<{ label: string; value: number }>;
  piecesTrend: Array<{ label: string; value: number }>;
};

export default async function AnalyticsPage() {
  const data = await apiFetch<AnalyticsOverview>("/analytics/overview").catch(() => ({
    revenueToday: 0,
    pcsSoldToday: 0,
    averageOrderSize: 0,
    repeatCustomerRate: 0,
    cancelledOrders: 0,
    productionEfficiency: 0,
    ordersToday: 0,
    activeOrdersToday: 0,
    topLocations: [],
    topItems: [],
    revenueTrend: [],
    piecesTrend: []
  }));
  const topItem = data.topItems?.[0];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-line/80 bg-panel shadow-sm shadow-black/10">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Analytics</p>
            <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sales performance</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground/52">
                  Today&apos;s completed sales, order mix, and demand patterns in one operating view.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <MiniMetric label="Orders" value={data.ordersToday ?? 0} />
                <MiniMetric label="Pending" value={data.activeOrdersToday ?? 0} />
                <MiniMetric label="Efficiency" value={`${data.productionEfficiency ?? 0}%`} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-accent/25 bg-accent/[0.08] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Most Ordered Today</p>
            <p className="mt-4 truncate text-2xl font-semibold">{topItem?.name ?? "No completed item yet"}</p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <p className="text-sm text-foreground/55">Based on completed order items</p>
              <p className="text-right text-3xl font-semibold tracking-tight">{topItem?.quantity ?? 0}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue Today" value={formatPeso(data.revenueToday)} hint="Completed orders only" tone="accent" />
        <StatCard label="Pieces Sold" value={String(data.pcsSoldToday ?? 0)} hint={`${data.activeOrdersToday ?? 0} orders still pending`} tone="success" />
        <StatCard label="Average Order Size" value={String(data.averageOrderSize ?? 0)} hint="Pieces per completed order" />
        <StatCard label="Cancelled Today" value={String(data.cancelledOrders ?? 0)} hint="Orders removed from production" tone="danger" />
      </div>
      <AnalyticsPanels data={data} />
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line/75 bg-black/[0.08] px-3 py-2.5 sm:min-w-24">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/38">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function formatPeso(value: number) {
  return `Php ${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
