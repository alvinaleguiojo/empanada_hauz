import { AnalyticsPanels } from "@/components/analytics/analytics-panels";
import { StatCard } from "@/components/dashboard/stat-card";
import { apiFetch } from "@/lib/api";

export default async function AnalyticsPage() {
  const data = await apiFetch<any>("/analytics/overview").catch(() => ({
    revenueToday: 0,
    pcsSoldToday: 0,
    averageOrderSize: 0,
    repeatCustomerRate: 0,
    cancelledOrders: 0,
    productionEfficiency: 0,
    ordersToday: 0,
    activeOrdersToday: 0,
    topLocations: [],
    revenueTrend: [],
    piecesTrend: []
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue Sold Today" value={formatPeso(data.revenueToday)} hint="Completed orders only" tone="accent" />
        <StatCard label="Pieces Sold" value={String(data.pcsSoldToday ?? 0)} hint={`${data.activeOrdersToday ?? 0} active orders pending`} tone="success" />
        <StatCard label="Average Sold Order" value={String(data.averageOrderSize ?? 0)} hint="Pieces per completed order" />
        <StatCard label="Cancelled Today" value={String(data.cancelledOrders ?? 0)} tone="danger" />
      </div>
      <AnalyticsPanels data={data} />
    </div>
  );
}

function formatPeso(value: number) {
  return `Php ${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
