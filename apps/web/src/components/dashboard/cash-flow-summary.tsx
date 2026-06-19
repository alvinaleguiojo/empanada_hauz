import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CashFlowDay = {
  date: string;
  label: string;
  actualSales: number;
  expenses: number;
  moneyOnHand: number;
};

export function CashFlowSummary({
  days,
  totalMoneyOnHand
}: {
  days: CashFlowDay[];
  totalMoneyOnHand: number;
}) {
  const visibleDays = days.filter((day) => day.actualSales > 0 || day.expenses > 0).slice(-7).reverse();

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Sales vs Expenses</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">Money on Hand</h2>
          <p className="mt-1 text-sm text-foreground/50">Actual sales minus recorded expenses by day.</p>
        </div>
        <div className="rounded-lg border border-accent/25 bg-accent/[0.08] px-4 py-3 text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/45">Total</p>
          <p className="mt-1 text-2xl font-semibold">{formatPeso(totalMoneyOnHand)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {visibleDays.map((day) => (
          <div key={day.date} className="rounded-lg border border-line/75 bg-black/[0.06] p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold">{day.label}</h3>
              <span className={cn("rounded-md px-2 py-1 text-xs font-semibold", day.moneyOnHand >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
                {formatPeso(day.moneyOnHand)}
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <CashLine label="Actual Sales" value={day.actualSales} />
              <CashLine label="Expenses" value={day.expenses} />
            </div>
          </div>
        ))}

        {visibleDays.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line/75 bg-black/[0.04] p-5 text-sm text-foreground/50">
            No sales or expenses recorded in the last 7 business days.
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function CashLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/40">{label}</p>
      <p className="mt-1 text-lg font-semibold">{formatPeso(value)}</p>
    </div>
  );
}

function formatPeso(value: number) {
  return `Php ${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
