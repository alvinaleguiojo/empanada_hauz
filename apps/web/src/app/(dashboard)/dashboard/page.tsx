import { type CashFlowData } from "@/components/dashboard/cash-flow-summary";
import { DashboardView, type DashboardData } from "@/components/dashboard/dashboard-view";
import { apiFetch } from "@/lib/api";

export default async function DashboardPage() {
  const data = await apiFetch<DashboardData>("/analytics/overview").catch((): DashboardData => ({
    range: "today",
    rangeLabel: "Today",
    startDate: "",
    endDate: "",
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

  return <DashboardView initialData={{ ...data, cashFlow: data.cashFlow ?? getEmptyCashFlow() }} />;
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
