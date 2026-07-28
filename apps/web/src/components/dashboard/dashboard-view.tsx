"use client";

import { useRef, useState } from "react";
import { CalendarDays, CircleCheck, Coins, Loader2, Package, UsersRound, Wallet } from "lucide-react";
import { AnalyticsPanels } from "@/components/analytics/analytics-panels";
import { CashFlowSummary, rangeOptions, type CashFlowData, type CashRange } from "@/components/dashboard/cash-flow-summary";
import { LiveEvents } from "@/components/dashboard/live-events";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  repeatCustomerCount: number;
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
  const [customOpen, setCustomOpen] = useState(initialData.range === "custom");
  const [customStartDate, setCustomStartDate] = useState(initialData.startDate ?? initialData.cashFlow?.startDate ?? "");
  const [customEndDate, setCustomEndDate] = useState(initialData.endDate ?? initialData.cashFlow?.endDate ?? "");
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);
  const activeRange = data.range ?? data.cashFlow?.range ?? "today";
  const rangeLabel = data.rangeLabel ?? data.cashFlow?.label ?? "Today";
  const rangeText = rangeLabel.toLowerCase();

  async function selectRange(range: CashRange) {
    if (range === activeRange || loadingRange) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingRange(range);
    setError("");
    try {
      const nextData = await apiFetch<DashboardData>(`/analytics/overview?range=${range}`);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setData(nextData);
      setCustomStartDate(nextData.startDate ?? nextData.cashFlow?.startDate ?? "");
      setCustomEndDate(nextData.endDate ?? nextData.cashFlow?.endDate ?? "");
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : "Unable to load dashboard data.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingRange(null);
      }
    }
  }

  async function loadCustomRange(startDate: string, endDate: string, closeOnSuccess = false) {
    if (!startDate || !endDate) {
      return;
    }

    if (startDate > endDate) {
      setError("Start date must be before or equal to end date.");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingRange("custom");
    setError("");
    try {
      const params = new URLSearchParams({
        range: "custom",
        startDate,
        endDate
      });
      const nextData = await apiFetch<DashboardData>(`/analytics/overview?${params.toString()}`);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setData(nextData);
      setCustomStartDate(nextData.startDate ?? nextData.cashFlow?.startDate ?? startDate);
      setCustomEndDate(nextData.endDate ?? nextData.cashFlow?.endDate ?? endDate);
      if (closeOnSuccess) {
        setCustomOpen(false);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : "Unable to load dashboard data.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingRange(null);
      }
    }
  }

  function applyCustomRange() {
    return loadCustomRange(customStartDate, customEndDate, true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-foreground/45">{rangeLabel}&apos;s scheduled orders, sales, and live operational activity.</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
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
            <button
              type="button"
              suppressHydrationWarning
              onClick={() => setCustomOpen((open) => !open)}
              className={cn(
                "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition sm:flex-none",
                activeRange === "custom" ? "bg-accent text-white shadow-sm shadow-accent/20" : "text-foreground/62 hover:bg-white/[0.06] hover:text-foreground"
              )}
              aria-expanded={customOpen}
            >
              <CalendarDays size={15} className="shrink-0" />
              <span className="truncate">Custom</span>
            </button>
          </div>

          {customOpen ? (
            <div className="grid w-full gap-2 rounded-lg border border-line/80 bg-panel p-3 shadow-sm shadow-black/10 sm:w-[520px] sm:grid-cols-[1fr_1fr_auto]">
              <Input
                type="date"
                aria-label="Start date"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                className="h-9"
              />
              <Input
                type="date"
                aria-label="End date"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                className="h-9"
              />
              <Button type="button" onClick={() => void applyCustomRange()} disabled={!customStartDate || !customEndDate || loadingRange === "custom"} className="h-9 px-3">
                {loadingRange === "custom" ? <Loader2 size={15} className="shrink-0 animate-spin" /> : null}
                Apply
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <p className="rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Revenue Sold" value={formatPeso(data.revenueToday)} hint={`Completed orders for ${rangeText}`} tone="accent" icon={Coins} />
        <StatCard label="Money on Hand" value={formatPeso(data.moneyOnHandToday)} hint={`${formatPeso(data.revenueToday)} sales - ${formatPeso(data.expensesToday)} expenses`} tone="success" icon={Wallet} />
        <StatCard label="Pieces Sold" value={String(data.pcsSoldToday ?? 0)} hint={`${data.activeOrdersToday ?? 0} active orders pending`} tone="success" icon={Package} />
        <StatCard label="Repeat Customers" value={String(data.repeatCustomerCount ?? 0)} hint={`${formatPercent(data.repeatCustomerRate)} of customers for ${rangeText}`} tone="neutral" icon={UsersRound} />
        <StatCard label="Completion Rate" value={`${data.productionEfficiency ?? 0}%`} hint={`${data.cancelledOrders ?? 0} cancelled for ${rangeText}`} tone="danger" icon={CircleCheck} />
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

function formatPercent(value: number) {
  return `${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}
