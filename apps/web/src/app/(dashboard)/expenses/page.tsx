import { ExpensesManager, type ExpensesOverview } from "@/components/expenses/expenses-manager";
import { apiFetch } from "@/lib/api";

function todayInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export default async function ExpensesPage() {
  const today = todayInputValue();
  const initialData = await apiFetch<ExpensesOverview>(`/expenses?startDate=${today}&endDate=${today}`).catch(() => ({
    expenses: [],
    total: 0,
    todayTotal: 0,
    monthTotal: 0,
    categoryTotals: [],
    range: {
      startDate: today,
      endDate: today
    }
  }));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-foreground/55">Daily expense entry, category totals, and month-to-date spend.</p>
        <h1 className="text-3xl font-semibold">Expenses</h1>
      </div>
      <ExpensesManager initialData={initialData} />
    </div>
  );
}
