import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
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

export function CashFlowSummary({ data }: { data: CashFlowData }) {
  const visibleDays = data.days.filter((day) => day.actualSales > 0 || day.expenses > 0).reverse();
  const max = Math.max(...data.days.map((day) => Math.max(day.actualSales, day.expenses)), 1);
  const net = Number(data.totalSales ?? 0) - Number(data.totalExpenses ?? 0);
  const expenseRatio = data.totalSales > 0 ? (data.totalExpenses / data.totalSales) * 100 : 0;

  return (
    <Card className="overflow-hidden border-white/8 bg-white/[0.025] p-0">
      <div className="h-[3px] w-full bg-[linear-gradient(90deg,#25d48f,#4dd6ff,#ffb347)]" />
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-300/10 text-emerald-200"><Wallet size={16} /></span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/38">Financial pulse</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">Cash flow</h2>
              </div>
            </div>
            <p className="mt-2 text-xs text-foreground/42">
              {data.startDate === data.endDate ? data.startDate : \`\${data.startDate} to \${data.endDate}\`}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
            <SummaryMetric label="Sales" value={data.totalSales} tone="sales" />
            <SummaryMetric label="Expenses" value={data.totalExpenses} tone="expense" />
            <SummaryMetric label="Net" value={net} tone={net >= 0 ? "positive" : "negative"} />
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-[linear-gradient(145deg,rgba(15,24,40,0.95),rgba(10,18,31,0.98))]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-white/72">Sales vs expenses</p>
              <p className="mt-0.5 text-[10px] text-white/32">{Math.round(expenseRatio)}% expense load against sales</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.14em]">
              <span className="inline-flex items-center gap-1.5 text-emerald-200/75"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Sales</span>
              <span className="inline-flex items-center gap-1.5 text-orange-200/75"><span className="h-2 w-2 rounded-full bg-orange-300" /> Expenses</span>
            </div>
          </div>

          {data.days.length ? (
            <div className="overflow-x-auto px-4 py-4">
              <div className="flex min-w-[560px] items-end gap-2">
                {data.days.map((day) => {
                  const salesHeight = Math.max((day.actualSales / max) * 170, day.actualSales > 0 ? 4 : 0);
                  const expenseHeight = Math.max((day.expenses / max) * 170, day.expenses > 0 ? 4 : 0);
                  return (
                    <div key={day.date} className="flex min-w-12 flex-1 flex-col items-center gap-2">
                      <div className="flex h-[170px] w-full max-w-14 items-end justify-center gap-1 rounded-lg bg-white/[0.025] px-1">
                        <div className="w-1/2 rounded-t-md bg-gradient-to-t from-emerald-500/70 to-emerald-300" style={{ height: \`\${salesHeight}px\` }} title={\`\${day.label}: \${formatPeso(day.actualSales)} sales\`} />
                        <div className="w-1/2 rounded-t-md bg-gradient-to-t from-orange-500/70 to-orange-300" style={{ height: \`\${expenseHeight}px\` }} title={\`\${day.label}: \${formatPeso(day.expenses)} expenses\`} />
                      </div>
                      <span className="max-w-14 truncate text-[10px] font-semibold text-white/35">{compactDay(day.label)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-white/35">No sales or expenses recorded for this range.</div>
          )}
        </div>

        {visibleDays.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {visibleDays.slice(0, 4).map((day) => (
              <div key={day.date} className="rounded-xl border border-line/70 bg-black/[0.04] px-3 py-3">
                <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/35">{day.label}</p>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <span className="inline-flex items-center gap-1 text-emerald-300"><ArrowUpRight size={13} /> {formatPeso(day.actualSales)}</span>
                  <span className="inline-flex items-center gap-1 text-orange-300"><ArrowDownRight size={13} /> {formatPeso(day.expenses)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function SummaryMetric({ label, value, tone }: { label: string; value: number; tone: "sales" | "expense" | "positive" | "negative" }) {
  return (
    <div className="rounded-xl border border-line/70 bg-black/[0.04] px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-foreground/35">{label}</p>
      <p className={cn("mt-1.5 truncate text-sm font-semibold tabular-nums", tone === "sales" && "text-emerald-300", tone === "expense" && "text-orange-300", tone === "positive" && "text-emerald-300", tone === "negative" && "text-danger")}>{formatPeso(value)}</p>
    </div>
  );
}

function compactDay(label: string) {
  const dayMatch = label.match(/\\b([A-Za-z]{3})\\s+(\\d{1,2})\\b/);
  return dayMatch ? \`\${dayMatch[1]} \${dayMatch[2]}\` : label.slice(0, 7);
}

function formatPeso(value: number) {
  return \`Php \${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}\`;
}
