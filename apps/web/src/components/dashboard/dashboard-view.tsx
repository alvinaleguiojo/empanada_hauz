"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { AnalyticsPanels } from "@/components/analytics/analytics-panels";
import { CashFlowSummary, rangeOptions, type CashFlowData, type CashRange } from "@/components/dashboard/cash-flow-summary";
import { LiveEvents } from "@/components/dashboard/live-events";
import { StatCard } from "@/components/dashboard/stat-card";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

export type DashboardData = {
  range?: CashRange;
  rangeLabel?: string;
  startDate?: string;
  endDate?: string;
  revenueToday: number;
  pcsSoldToday: number;
  averageOrderSize: number;
  repeatCustomerRate: number;
  cancelledOrders: number;
  productionEfficiency: number;
  ordersToday: number;
  activeOrdersToday: number;
  expensesToday: number;
  moneyOnHandToday: number;
  topLocations: Array<{
    location: string | null;
    _count?: {
      _all?: number;
    };
  }>;
  topItems?: Array<{
    name: string;
    quantity: number;
  }>;
  revenueTrend: Array<{
    label: string;
    value: number;
  }>;
  piecesTrend: Array<{
    label: string;
    value: number;
  }>;
  cashFlow: CashFlowData;
};

export function DashboardView({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [loadingRange, setLoadingRange] = useState<CashRange | null>(null);
  const [error, setError] = useState("");
  const activeRange = data.range ?? data.cashFlow?.range ?? "today";
  const rangeLabel = data.rangeLabel ?? data.cashFlow?.label ?? "Today";
  const rangeText = rangeLabel.toLowerCase();

  async function selectRange(range: CashRange) {
    if (range === activeRange || loadingRange) {
      return;
    }

    setLoadingRange(range);
    setError("");
    try {
      setData(await apiFetch<DashboardData>(`/analytics/overview?range=${range}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard data.");
    } finally {
      setLoadingRange(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-foreground/45">{rangeLabel}&apos;s scheduled orders, sales, and live operational activity.</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        <div className="inline-flex w-full rounded-lg border border-line/80 bg-black/10 p-1 sm:w-auto">
          {rangeOptions.map((option) => {
            const active = option.value === activeRange;
            const loading = loadingRange === option.value;
            return (
              <button
                key={option.value}
                type="button"
                suppressHydrationWarning
                onClick={() => void selectRange(option.value)}
                className={cn(
                  "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition sm:flex-none",
                  active ? "bg-accent text-white shadow-sm shadow-accent/20" : "text-foreground/62 hover:bg-white/[0.06] hover:text-foreground"
                )}
              >
                {loading ? <Loader2 size={15} className="shrink-0 animate-spin" /> : null}
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? <p className="rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue Sold" value={formatPeso(data.revenueToday)} hint={`Completed orders for ${rangeText}`} tone="accent" />
        <StatCard label="Money on Hand" value={formatPeso(data.moneyOnHandToday)} hint={`${formatPeso(data.revenueToday)} sales - ${formatPeso(data.expensesToday)} expenses`} tone="success" />
        <StatCard label="Pieces Sold" value={String(data.pcsSoldToday ?? 0)} hint={`${data.activeOrdersToday ?? 0} active orders pending`} tone="success" />
        <StatCard label="Completion Rate" value={`${data.productionEfficiency ?? 0}%`} hint={`${data.cancelledOrders ?? 0} cancelled for ${rangeText}`} tone="danger" />
      </div>

      <CashFlowSummary data={data.cashFlow} />
      <AnalyticsPanels data={data} rangeLabel={rangeLabel} />
      <LiveEvents />
    </div>
  );
}

function formatPeso(value: number) {
  return `Php ${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
