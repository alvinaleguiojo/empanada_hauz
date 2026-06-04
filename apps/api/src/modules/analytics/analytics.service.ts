import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const todayRange = getManilaDayRange(new Date());
    const trendStart = addDays(todayRange.start, -6);

    const [todayOrders, trendOrders, allActiveOrders, topLocations] = await Promise.all([
      this.prisma.order.findMany({
        where: orderBusinessDateWhere(todayRange.start, todayRange.end),
        include: { customer: true }
      }),
      this.prisma.order.findMany({
        where: orderBusinessDateWhere(trendStart, todayRange.end)
      }),
      this.prisma.order.findMany({
        where: { status: { not: "cancelled" } },
        select: { customerId: true }
      }),
      this.prisma.order.groupBy({
        by: ["location"],
        _count: { _all: true },
        where: {
          ...orderBusinessDateWhere(todayRange.start, todayRange.end),
          location: { not: null }
        },
        orderBy: { _count: { location: "desc" } },
        take: 5
      })
    ]);

    const sellableTodayOrders = todayOrders.filter((order) => order.status !== "cancelled");
    const pendingTodayOrders = todayOrders.filter((order) => !["completed", "cancelled"].includes(order.status));
    const completedTodayOrders = todayOrders.filter((order) => order.status === "completed");
    const completed = todayOrders.filter((order) => order.status === "completed").length;
    const cancelled = todayOrders.filter((order) => order.status === "cancelled").length;
    const uniqueTodayCustomers = new Set(todayOrders.map((order) => order.customerId));
    const lifetimeOrderCounts = countBy(allActiveOrders, (order) => order.customerId);
    const repeatTodayCustomers = [...uniqueTodayCustomers].filter((customerId) => (lifetimeOrderCounts.get(customerId) ?? 0) > 1);
    const repeatCustomerRate = uniqueTodayCustomers.size === 0 ? 0 : repeatTodayCustomers.length / uniqueTodayCustomers.size;
    const revenueTrend = buildDailyTrend(trendStart, 7, trendOrders, "revenue");
    const piecesTrend = buildDailyTrend(trendStart, 7, trendOrders, "pieces");

    return {
      revenueToday: sum(completedTodayOrders, (order) => Number(order.totalAmount)),
      pcsSoldToday: sum(completedTodayOrders, (order) => order.quantity),
      ordersToday: todayOrders.length,
      activeOrdersToday: pendingTodayOrders.length,
      averageOrderSize:
        completedTodayOrders.length === 0 ? 0 : Number((sum(completedTodayOrders, (order) => order.quantity) / completedTodayOrders.length).toFixed(1)),
      repeatCustomerRate: Number((repeatCustomerRate * 100).toFixed(2)),
      cancelledOrders: cancelled,
      productionEfficiency: sellableTodayOrders.length === 0 ? 0 : Number(((completed / sellableTodayOrders.length) * 100).toFixed(2)),
      topLocations,
      topItems: buildTopItems(completedTodayOrders),
      revenueTrend,
      piecesTrend
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

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
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
