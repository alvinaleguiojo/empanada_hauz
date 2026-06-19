"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type CashFlowDay = {
  date: string;
  label: string;
  actualSales: number;
  expenses: number;
  moneyOnHand: number;
};

export type CashFlowData = {
  range: CashRange;
  label: string;
  startDate: string;
  endDate: string;
  totalSales: number;
  totalExpenses: number;
  moneyOnHand: number;
  days: CashFlowDay[];
};

type CashRange = "today" | "week" | "month";

const rangeOptions: Array<{ label: string; value: CashRange }> = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" }
];

export function CashFlowSummary({
  initialData
}: {
  initialData: CashFlowData;
}) {
  const [data, setData] = useState(initialData);
  const [loadingRange, setLoadingRange] = useState<CashRange | null>(null);
  const [error, setError] = useState("");
  const visibleDays = data.days.filter((day) => day.actualSales > 0 || day.expenses > 0).reverse();

  async function selectRange(range: CashRange) {
    if (range === data.range || loadingRange) {
      return;
    }

    setLoadingRange(range);
    setError("");
    try {
      setData(await apiFetch<CashFlowData>(`/analytics/cash-flow?range=${range}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load cash summary.");
    } finally {
      setLoadingRange(null);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Cash Summary</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">Sales, Expenses, Money on Hand</h2>
          <p className="mt-1 text-sm text-foreground/50">
            {data.startDate === data.endDate ? data.startDate : `${data.startDate} to ${data.endDate}`}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-line/80 bg-black/10 p-1">
          {rangeOptions.map((option) => {
            const active = option.value === data.range;
            const loading = loadingRange === option.value;
            return (
              <button
                key={option.value}
                type="button"
                suppressHydrationWarning
                onClick={() => void selectRange(option.value)}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition",
                  active ? "bg-accent text-white shadow-sm shadow-accent/20" : "text-foreground/62 hover:bg-white/[0.06] hover:text-foreground"
                )}
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryMetric label="Actual Sales" value={data.totalSales} />
        <SummaryMetric label="Expenses" value={data.totalExpenses} />
        <SummaryMetric label="Money on Hand" value={data.moneyOnHand} highlight />
      </div>

      {error ? <p className="mt-4 rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

      <div className="mt-5 overflow-x-auto rounded-lg border border-line/75">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[1fr_110px_110px_120px] gap-3 bg-black/[0.08] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/42">
            <span>Date</span>
            <span className="text-right">Sales</span>
            <span className="text-right">Expenses</span>
            <span className="text-right">On Hand</span>
          </div>
          <div className="divide-y divide-line/75">
            {visibleDays.map((day) => (
              <div key={day.date} className="grid grid-cols-[1fr_110px_110px_120px] gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 truncate font-medium">{day.label}</span>
                <span className="text-right text-foreground/72">{formatPeso(day.actualSales)}</span>
                <span className="text-right text-foreground/72">{formatPeso(day.expenses)}</span>
                <span className={cn("text-right font-semibold", day.moneyOnHand >= 0 ? "text-success" : "text-danger")}>{formatPeso(day.moneyOnHand)}</span>
              </div>
            ))}

            {visibleDays.length === 0 ? (
              <div className="px-4 py-6 text-sm text-foreground/50">
                No sales or expenses recorded for {data.label.toLowerCase()}.
              </div>
            ) : null}
            </div>
        </div>
      </div>
    </Card>
  );
}

function SummaryMetric({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-line/75 bg-black/[0.06] p-4", highlight && "border-accent/25 bg-accent/[0.08]")}>
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-foreground/42">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight", highlight && (value >= 0 ? "text-success" : "text-danger"))}>{formatPeso(value)}</p>
    </div>
  );
}

function formatPeso(value: number) {
  return `Php ${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
