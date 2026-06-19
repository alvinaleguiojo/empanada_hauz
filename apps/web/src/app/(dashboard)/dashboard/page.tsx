import { AnalyticsPanels } from "@/components/analytics/analytics-panels";
import { CashFlowSummary, type CashFlowData } from "@/components/dashboard/cash-flow-summary";
import { LiveEvents } from "@/components/dashboard/live-events";
import { StatCard } from "@/components/dashboard/stat-card";
import { apiFetch } from "@/lib/api";

export default async function DashboardPage() {
  const data = await apiFetch<any>("/analytics/overview").catch(() => ({
    revenueToday: 0,
    pcsSoldToday: 0,
    averageOrderSize: 0,
    repeatCustomerRate: 0,
    cancelledOrders: 0,
    productionEfficiency: 0,
    ordersToday: 0,
    activeOrdersToday: 0,
    expensesToday: 0,
    moneyOnHandToday: 0,
    topLocations: [],
    revenueTrend: [],
    piecesTrend: [],
    cashFlow: getEmptyCashFlow()
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-foreground/45">Today&apos;s scheduled orders, sales, and live operational activity.</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue Sold Today" value={formatPeso(data.revenueToday)} hint="Completed orders only" tone="accent" />
        <StatCard label="Money on Hand Today" value={formatPeso(data.moneyOnHandToday)} hint={`${formatPeso(data.revenueToday)} sales - ${formatPeso(data.expensesToday)} expenses`} tone="success" />
        <StatCard label="Pieces Sold" value={String(data.pcsSoldToday ?? 0)} hint={`${data.activeOrdersToday ?? 0} active orders pending`} tone="success" />
        <StatCard label="Completion Rate" value={`${data.productionEfficiency ?? 0}%`} hint={`${data.cancelledOrders ?? 0} cancelled today`} tone="danger" />
      </div>
      <CashFlowSummary initialData={data.cashFlow ?? getEmptyCashFlow()} />
      <AnalyticsPanels data={data} />
      <LiveEvents />
    </div>
  );
}

function formatPeso(value: number) {
  return `Php ${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function getEmptyCashFlow(): CashFlowData {
  return {
    range: "today",
    label: "Today",
    startDate: "",
    endDate: "",
    totalSales: 0,
    totalExpenses: 0,
    moneyOnHand: 0,
    days: []
  };
}
