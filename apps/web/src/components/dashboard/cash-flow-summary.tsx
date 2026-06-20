import { Card } from "@/components/ui/card";
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

export type CashRange = "today" | "week" | "month" | "custom";

export const rangeOptions: Array<{ label: string; value: Exclude<CashRange, "custom"> }> = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" }
];

export function CashFlowSummary({
  data
}: {
  data: CashFlowData;
}) {
  const visibleDays = data.days.filter((day) => day.actualSales > 0 || day.expenses > 0).reverse();

  return (
    <Card className="p-5">
      <div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Cash Summary</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">Sales, Expenses, Money on Hand</h2>
          <p className="mt-1 text-sm text-foreground/50">
            {data.startDate === data.endDate ? data.startDate : `${data.startDate} to ${data.endDate}`}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryMetric label="Actual Sales" value={data.totalSales} />
        <SummaryMetric label="Expenses" value={data.totalExpenses} />
        <SummaryMetric label="Money on Hand" value={data.moneyOnHand} highlight />
      </div>

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
