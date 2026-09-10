import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class AiAdminAnalyticsToolsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrderMetrics(range: "today" | "week" | "month" = "today") {
    const { start, end } = getManilaRange(range);
    const where = orderBusinessDateWhere(start, end);
    const [totalOrders, completedOrders, cancelledOrders, activeOrders, completed] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: { AND: [where, { status: "completed" }] } }),
      this.prisma.order.count({ where: { AND: [where, { status: "cancelled" }] } }),
      this.prisma.order.count({ where: { AND: [where, { status: { notIn: ["completed", "cancelled"] } }] } }),
      this.prisma.order.findMany({ where: { AND: [where, { status: "completed" }] }, select: { quantity: true, totalAmount: true } })
    ]);

    return {
      range,
      startDate: start.toISOString(),
      endDateExclusive: end.toISOString(),
      totalOrders,
      completedOrders,
      cancelledOrders,
      activeOrders,
      piecesSold: completed.reduce((sum, order) => sum + order.quantity, 0),
      revenue: completed.reduce((sum, order) => sum + Number(order.totalAmount), 0)
    };
  }
}

function orderBusinessDateWhere(start: Date, end: Date) {
  return {
    OR: [
      { preferredSchedule: { gte: start, lt: end } },
      {
        createdAt: { gte: start, lt: end },
        OR: [
          { preferredSchedule: null },
          { preferredSchedule: { isSet: false } }
        ]
      }
    ]
  };
}

function getManilaRange(range: "today" | "week" | "month") {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Unable to determine Manila date.");

  const today = new Date(`${year}-${month}-${day}T00:00:00+08:00`);
  if (range === "today") return { start: today, end: addDays(today, 1) };

  if (range === "month") {
    const monthStart = new Date(`${year}-${month}-01T00:00:00+08:00`);
    return { start: monthStart, end: addDays(today, 1) };
  }

  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "short" }).format(now);
  const weekdayNumber = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[weekday] ?? 0;
  const daysFromMonday = weekdayNumber === 0 ? 6 : weekdayNumber - 1;
  return { start: addDays(today, -daysFromMonday), end: addDays(today, 1) };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
