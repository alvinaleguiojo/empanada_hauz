import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

type CashRangeKey = "today" | "week" | "month" | "custom";

type CashFlowRange = {
  key: CashRangeKey;
  label: string;
  start: Date;
  end: Date;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(rangeValue?: string, startDate?: string, endDate?: string) {
    const range = getCashFlowRange(rangeValue, startDate, endDate);
    const trendStart = range.key === "today" ? addDays(range.start, -6) : range.start;
    const trendDays = range.key === "today" ? 7 : countDays(trendStart, range.end);
    const cashFlowPromise = this.getCashFlowForRange(range);

    const [cashFlow, rangeOrders, trendOrders, allActiveOrders, topLocations] = await Promise.all([
      cashFlowPromise,
      this.prisma.order.findMany({
        where: orderBusinessDateWhere(range.start, range.end),
        include: { customer: true }
      }),
      this.prisma.order.findMany({
        where: orderBusinessDateWhere(trendStart, range.end)
      }),
      this.prisma.order.findMany({
        where: { status: { not: "cancelled" } },
        select: { customerId: true }
      }),
      this.prisma.order.groupBy({
        by: ["location"],
        _count: { _all: true },
        where: {
          ...orderBusinessDateWhere(range.start, range.end),
          location: { not: null }
        },
        orderBy: { _count: { location: "desc" } },
        take: 5
      })
    ]);

    const sellableRangeOrders = rangeOrders.filter((order) => order.status !== "cancelled");
    const pendingRangeOrders = rangeOrders.filter((order) => !["completed", "cancelled"].includes(order.status));
    const completedRangeOrders = rangeOrders.filter((order) => order.status === "completed");
    const completed = completedRangeOrders.length;
    const cancelled = rangeOrders.filter((order) => order.status === "cancelled").length;
    const uniqueRangeCustomers = new Set(rangeOrders.map((order) => order.customerId));
    const lifetimeOrderCounts = countBy(allActiveOrders, (order) => order.customerId);
    const repeatRangeCustomers = [...uniqueRangeCustomers].filter((customerId) => (lifetimeOrderCounts.get(customerId) ?? 0) > 1);
    const repeatCustomerRate = uniqueRangeCustomers.size === 0 ? 0 : repeatRangeCustomers.length / uniqueRangeCustomers.size;
    const revenueTrend = buildDailyTrend(trendStart, trendDays, trendOrders, "revenue");
    const piecesTrend = buildDailyTrend(trendStart, trendDays, trendOrders, "pieces");
    const revenueToday = sum(completedRangeOrders, (order) => Number(order.totalAmount));

    return {
      range: range.key,
      rangeLabel: range.label,
      startDate: toDateInputValue(range.start),
      endDate: toDateInputValue(addDays(range.end, -1)),
      revenueToday,
      expensesToday: cashFlow.totalExpenses,
      moneyOnHandToday: cashFlow.moneyOnHand,
      pcsSoldToday: sum(completedRangeOrders, (order) => order.quantity),
      ordersToday: rangeOrders.length,
      activeOrdersToday: pendingRangeOrders.length,
      averageOrderSize:
        completedRangeOrders.length === 0 ? 0 : Number((sum(completedRangeOrders, (order) => order.quantity) / completedRangeOrders.length).toFixed(1)),
      repeatCustomerRate: Number((repeatCustomerRate * 100).toFixed(2)),
      cancelledOrders: cancelled,
      productionEfficiency: sellableRangeOrders.length === 0 ? 0 : Number(((completed / sellableRangeOrders.length) * 100).toFixed(2)),
      topLocations,
      topItems: buildTopItems(completedRangeOrders),
      revenueTrend,
      piecesTrend,
      cashFlow
    };
  }

  async getCashFlow(rangeValue?: string, startDate?: string, endDate?: string) {
    return this.getCashFlowForRange(getCashFlowRange(rangeValue, startDate, endDate));
  }

  private async getCashFlowForRange(range: CashFlowRange) {
    const [orders, expenses] = await Promise.all([
      this.prisma.order.findMany({
        where: orderBusinessDateWhere(range.start, range.end),
        select: {
          preferredSchedule: true,
          createdAt: true,
          status: true,
          totalAmount: true
        }
      }),
      this.prisma.expense.findMany({
        where: {
          expenseDate: {
            gte: range.start,
            lt: range.end
          }
        },
        select: {
          expenseDate: true,
          amount: true
        }
      })
    ]);

    const days = buildDailyCashFlow(range.start, countDays(range.start, range.end), orders, expenses);
    const totalSales = sum(days, (day) => day.actualSales);
    const totalExpenses = sum(days, (day) => day.expenses);

    return {
      range: range.key,
      label: range.label,
      startDate: toDateInputValue(range.start),
      endDate: toDateInputValue(addDays(range.end, -1)),
      totalSales,
      totalExpenses,
      moneyOnHand: totalSales - totalExpenses,
      days
    };
  }
}

function orderBusinessDateWhere(start: Date, end: Date) {
  return {
    OR: [
      { preferredSchedule: { gte: start, lt: end } },
      {
        preferredSchedule: null,
        createdAt: { gte: start, lt: end }
      }
    ]
  };
}

function getManilaDayRange(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);

  const start = new Date(`${parts}T00:00:00+08:00`);
  return { start, end: addDays(start, 1) };
}

function getCashFlowRange(value?: string, startDate?: string, endDate?: string): CashFlowRange {
  const today = getManilaDayRange(new Date());

  if (value === "custom" || startDate || endDate) {
    if (!startDate || !endDate) {
      throw new BadRequestException("Custom date range requires both startDate and endDate.");
    }

    const start = parseManilaDateInput(startDate, "startDate");
    const inclusiveEnd = parseManilaDateInput(endDate, "endDate");

    if (start > inclusiveEnd) {
      throw new BadRequestException("startDate must be before or equal to endDate.");
    }

    return { key: "custom", label: "Custom Range", start, end: addDays(inclusiveEnd, 1) };
  }

  const key = value === "week" || value === "month" ? value : "today";

  if (key === "week") {
    const day = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        weekday: "short"
      })
        .format(today.start)
        .replace("Sun", "0")
        .replace("Mon", "1")
        .replace("Tue", "2")
        .replace("Wed", "3")
        .replace("Thu", "4")
        .replace("Fri", "5")
        .replace("Sat", "6")
    );
    const daysFromMonday = day === 0 ? 6 : day - 1;
    const start = addDays(today.start, -daysFromMonday);
    return { key, label: "This Week", start, end: today.end };
  }

  if (key === "month") {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit"
    }).format(today.start);
    const start = new Date(`${parts}-01T00:00:00+08:00`);
    return { key, label: "This Month", start, end: today.end };
  }

  return { key, label: "Today", start: today.start, end: today.end };
}

function parseManilaDateInput(value: string, fieldName: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${fieldName} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00+08:00`);

  if (Number.isNaN(date.getTime()) || toDateInputValue(date) !== value) {
    throw new BadRequestException(`${fieldName} is not a valid date.`);
  }

  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function countDays(start: Date, end: Date) {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

function sum<T>(items: T[], getValue: (item: T) => number) {
  return items.reduce((total, item) => total + getValue(item), 0);
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

function buildDailyTrend(
  start: Date,
  days: number,
  orders: Array<{ preferredSchedule: Date | null; createdAt: Date; status: string; totalAmount: unknown; quantity: number }>,
  metric: "revenue" | "pieces"
) {
  return Array.from({ length: days }, (_, index) => {
    const dayStart = addDays(start, index);
    const dayEnd = addDays(dayStart, 1);
    const dayOrders = orders.filter((order) => {
      if (order.status !== "completed") {
        return false;
      }

      const businessDate = order.preferredSchedule ?? order.createdAt;
      return businessDate >= dayStart && businessDate < dayEnd;
    });

    return {
      label: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric" }).format(dayStart),
      value: metric === "revenue" ? sum(dayOrders, (order) => Number(order.totalAmount)) : sum(dayOrders, (order) => order.quantity)
    };
  });
}

function buildDailyCashFlow(
  start: Date,
  days: number,
  orders: Array<{ preferredSchedule: Date | null; createdAt: Date; status: string; totalAmount: unknown }>,
  expenses: Array<{ expenseDate: Date; amount: unknown }>
) {
  return Array.from({ length: days }, (_, index) => {
    const dayStart = addDays(start, index);
    const dayEnd = addDays(dayStart, 1);
    const dayOrders = orders.filter((order) => {
      if (order.status !== "completed") {
        return false;
      }

      const businessDate = order.preferredSchedule ?? order.createdAt;
      return businessDate >= dayStart && businessDate < dayEnd;
    });
    const dayExpenses = expenses.filter((expense) => expense.expenseDate >= dayStart && expense.expenseDate < dayEnd);
    const actualSales = sum(dayOrders, (order) => Number(order.totalAmount));
    const expenseTotal = sum(dayExpenses, (expense) => Number(expense.amount));

    return {
      date: toDateInputValue(dayStart),
      label: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" }).format(dayStart),
      actualSales,
      expenses: expenseTotal,
      moneyOnHand: actualSales - expenseTotal
    };
  });
}

function buildTopItems(orders: Array<{ items: unknown; quantity: number }>) {
  const itemCounts = new Map<string, number>();

  for (const order of orders) {
    const lineItems = normalizeOrderItems(order.items);

    if (lineItems.length === 0) {
      addItemCount(itemCounts, "Empanada", order.quantity);
      continue;
    }

    for (const item of lineItems) {
      addItemCount(itemCounts, item.name, item.quantity);
    }
  }

  return [...itemCounts.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function normalizeOrderItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const quantity = Number(record.quantity);

      return name && Number.isFinite(quantity) && quantity > 0 ? { name, quantity } : null;
    })
    .filter((item): item is { name: string; quantity: number } => Boolean(item));
}

function addItemCount(counts: Map<string, number>, name: string, quantity: number) {
  const normalizedQuantity = Number(quantity) || 0;
  if (normalizedQuantity <= 0) {
    return;
  }

  counts.set(name, (counts.get(name) ?? 0) + normalizedQuantity);
}

function toDateInputValue(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}
