"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarDays, CircleDollarSign, Loader2, Plus, ReceiptText, Search, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  createdAt: string;
};

export type ExpensesOverview = {
  expenses: Expense[];
  total: number;
  todayTotal: number;
  monthTotal: number;
  categoryTotals: Array<{ category: string; total: number }>;
  range: {
    startDate: string;
    endDate: string;
  };
};

const categoryOptions = [
  { label: "Ingredients", value: "Ingredients" },
  { label: "Packaging", value: "Packaging" },
  { label: "Delivery", value: "Delivery" },
  { label: "Utilities", value: "Utilities" },
  { label: "Payroll", value: "Payroll" },
  { label: "Maintenance", value: "Maintenance" },
  { label: "Other", value: "Other" }
];

function todayInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function ExpensesManager({ initialData }: { initialData: ExpensesOverview }) {
  const [data, setData] = useState(initialData);
  const [category, setCategory] = useState(categoryOptions[0].value);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayInputValue());
  const [startDate, setStartDate] = useState(initialData.range.startDate);
  const [endDate, setEndDate] = useState(initialData.range.endDate);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const latestExpenses = useMemo(() => data.expenses.slice(0, 80), [data.expenses]);

  async function loadExpenses(nextStartDate = startDate, nextEndDate = endDate) {
    setLoading(true);
    setError("");
    try {
      const nextData = await apiFetch<ExpensesOverview>(`/expenses?startDate=${nextStartDate}&endDate=${nextEndDate}`);
      setData(nextData);
      setStartDate(nextData.range.startDate);
      setEndDate(nextData.range.endDate);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await apiFetch<Expense>("/expenses", {
        method: "POST",
        body: JSON.stringify({
          category,
          name,
          amount: Number(amount),
          expenseDate
        })
      });

      setName("");
      setAmount("");
      await loadExpenses(startDate, endDate);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <ExpenseMetric icon={CircleDollarSign} label="Today" value={formatPeso(data.todayTotal)} hint="Expenses entered for today" />
        <ExpenseMetric icon={WalletCards} label="Selected Range" value={formatPeso(data.total)} hint={`${data.range.startDate} to ${data.range.endDate}`} />
        <ExpenseMetric icon={CalendarDays} label="This Month" value={formatPeso(data.monthTotal)} hint="Month-to-date spend" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-accent/25 bg-accent/[0.08] text-accent">
              <Plus size={19} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Add Expense</h2>
              <p className="text-sm text-foreground/50">Record business spending as it happens.</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-foreground/42">Name</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Gas refill, pork, boxes" required />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-foreground/42">Category</span>
              <Select value={category} onChange={setCategory} options={categoryOptions} />
            </label>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-foreground/42">Amount</span>
                <Input min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-foreground/42">Date</span>
                <Input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required />
              </label>
            </div>

            {error ? <p className="rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

            <Button className="w-full" disabled={submitting}>
              {submitting ? <Loader2 size={17} className="animate-spin" /> : <ReceiptText size={17} />}
              Save Expense
            </Button>
          </form>
        </Card>

        <div className="space-y-5">
          <Card>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Expense Log</h2>
                <p className="text-sm text-foreground/50">Filter by date range to review daily or weekly spending.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[150px_150px_auto]">
                <Input aria-label="Start date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                <Input aria-label="End date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                <Button type="button" variant="secondary" onClick={() => void loadExpenses()} disabled={loading}>
                  {loading ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
                  Filter
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Name</Th>
                    <Th>Category</Th>
                    <Th>Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {latestExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <Td>{formatDate(expense.expenseDate)}</Td>
                      <Td>{expense.description}</Td>
                      <Td>{expense.category}</Td>
                      <Td>{formatPeso(expense.amount)}</Td>
                    </tr>
                  ))}
                  {latestExpenses.length === 0 ? (
                    <tr>
                      <Td colSpan={4}>
                        <span className="text-foreground/50">No expenses found for this range.</span>
                      </Td>
                    </tr>
                  ) : null}
                </tbody>
              </Table>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Category Totals</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {data.categoryTotals.map((item) => (
                <div key={item.category} className="rounded-lg border border-line/75 bg-black/[0.08] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium">{item.category}</p>
                    <p className="shrink-0 text-sm font-semibold">{formatPeso(item.total)}</p>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${getCategoryWidth(item.total, data.total)}%` }} />
                  </div>
                </div>
              ))}
              {data.categoryTotals.length === 0 ? <p className="text-sm text-foreground/50">No category totals yet.</p> : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ExpenseMetric({ icon: Icon, label, value, hint }: { icon: typeof CircleDollarSign; label: string; value: string; hint: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/42">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-sm text-foreground/48">{hint}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line/80 bg-black/10 text-foreground/65">
          <Icon size={19} />
        </div>
      </div>
    </Card>
  );
}

function formatPeso(value: number) {
  return `Php ${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function getCategoryWidth(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.max(4, Math.round((value / total) * 100));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to save expenses right now.";
}
