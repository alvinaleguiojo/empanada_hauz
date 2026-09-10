import { Injectable } from "@nestjs/common";
import { OrderStatus, Prisma } from "@prisma/client";
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

  async searchCustomers(query: string, limit = 10) {
    const normalized = query.trim();
    if (!normalized) return [];
    const take = clampLimit(limit, 10, 25);

    const exact = await this.prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: normalized, mode: Prisma.QueryMode.insensitive } },
          { phoneNumber: { contains: normalized, mode: Prisma.QueryMode.insensitive } },
          { messengerPsid: { contains: normalized, mode: Prisma.QueryMode.insensitive } }
        ]
      },
      select: customerSearchSelect,
      orderBy: [{ isVip: "desc" }, { totalSpent: "desc" }, { name: "asc" }],
      take
    });

    // The Orders board gets customer identity from Order.customer. Prefer those
    // linked records so duplicate/stale customer rows do not hide real order data.
    if (normalized.length >= 3) {
      const orderCustomers = await this.prisma.order.findMany({
        where: {
          customer: {
            OR: [
              { name: { contains: normalized, mode: Prisma.QueryMode.insensitive } },
              { phoneNumber: { contains: normalized, mode: Prisma.QueryMode.insensitive } },
              { messengerPsid: { contains: normalized, mode: Prisma.QueryMode.insensitive } }
            ]
          }
        },
        select: { customer: { select: customerSearchSelect } },
        orderBy: { createdAt: "desc" },
        take: Math.max(take * 5, 50)
      });

      const seen = new Set<string>();
      const relatedExact = orderCustomers
        .map((entry) => entry.customer)
        .filter((customer) => customer && !seen.has(customer.id) && seen.add(customer.id))
        .slice(0, take);

      if (relatedExact.length > 0) {
        return this.withActualCustomerOrderStats(relatedExact, "order_relation");
      }
    }

    if (exact.length > 0 || normalized.length < 3) {
      return this.withActualCustomerOrderStats(exact, "exact");
    }

    // Names are free-form and administrators commonly make a one-character
    // typo. Compare a bounded customer set locally only after exact paths miss.
    const candidates = await this.prisma.customer.findMany({
      select: customerSearchSelect,
      orderBy: [{ totalOrders: "desc" }, { totalSpent: "desc" }, { name: "asc" }],
      take: 500
    });
    const target = normalizeForMatch(normalized);
    const fuzzy = candidates
      .map((customer) => {
        const candidate = normalizeForMatch(customer.name);
        return { customer, distance: levenshteinDistance(target, candidate) };
      })
      .filter(({ customer, distance }) => {
        const candidate = normalizeForMatch(customer.name);
        const threshold = candidate.length <= 5 || target.length <= 5 ? 1 : 2;
        return distance <= threshold && distance < Math.max(target.length, candidate.length);
      })
      .sort((a, b) => a.distance - b.distance || b.customer.totalOrders - a.customer.totalOrders || Number(b.customer.totalSpent) - Number(a.customer.totalSpent))
      .slice(0, take);

    const fuzzyCustomers = await this.withActualCustomerOrderStats(fuzzy.map(({ customer }) => customer), "fuzzy");
    return fuzzyCustomers.map((customer, index) => ({
      ...customer,
      matchDistance: fuzzy[index]?.distance
    }));
  }

  private async withActualCustomerOrderStats<T extends { id: string; name: string; totalOrders: number; totalSpent: unknown }>(
    customers: T[],
    matchType: "exact" | "order_relation" | "fuzzy"
  ) {
    if (customers.length === 0) return [];

    const customerIds = customers.map((customer) => customer.id);
    const orders = await this.prisma.order.findMany({
      where: { customerId: { in: customerIds } },
      select: { customerId: true, totalAmount: true },
      take: 10000
    });

    const stats = new Map<string, { totalOrders: number; totalSpent: number }>();
    for (const order of orders) {
      const current = stats.get(order.customerId) ?? { totalOrders: 0, totalSpent: 0 };
      current.totalOrders += 1;
      current.totalSpent += Number(order.totalAmount) || 0;
      stats.set(order.customerId, current);
    }

    return customers
      .map((customer) => ({
        ...customer,
        totalOrders: stats.get(customer.id)?.totalOrders ?? 0,
        totalSpent: stats.get(customer.id)?.totalSpent ?? 0,
        matchType
      }))
      .sort((a, b) => b.totalOrders - a.totalOrders || Number(b.totalSpent) - Number(a.totalSpent) || a.name.localeCompare(b.name));
  }

  async searchOrders(query?: string, date?: string, status?: string, limit = 20) {
    const take = clampLimit(limit, 20, 50);
    const search = query?.trim();
    const dateFilter = date ? parseManilaDate(date) : undefined;
    const statusFilter = isOrderStatus(status);
    const filters: Prisma.OrderWhereInput[] = [];

    if (dateFilter) filters.push(orderBusinessDateWhere(dateFilter.start, dateFilter.end));
    if (statusFilter) filters.push({ status: status as OrderStatus });
    if (search) {
      filters.push({
        OR: [
          { orderNumber: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { location: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { address: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { notes: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { customer: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } },
          { customer: { phoneNumber: { contains: search, mode: Prisma.QueryMode.insensitive } } }
        ]
      });
    }

    const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : { AND: filters };
    const orders = await this.prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        quantity: true,
        totalAmount: true,
        deliveryMethod: true,
        paymentMethod: true,
        location: true,
        address: true,
        preferredSchedule: true,
        createdAt: true,
        customer: { select: { id: true, name: true, phoneNumber: true } }
      },
      orderBy: { createdAt: "desc" },
      take
    });

    return orders.map((order) => ({
      ...order,
      totalAmount: Number(order.totalAmount)
    }));
  }
}

const customerSearchSelect = {
  id: true,
  name: true,
  phoneNumber: true,
  defaultAddress: true,
  totalOrders: true,
  repeatCustomerCount: true,
  totalSpent: true,
  lastOrderDate: true,
  isVip: true
} satisfies Prisma.CustomerSelect;

function normalizeForMatch(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function clampLimit(value: number, fallback: number, maximum: number) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), maximum) : fallback;
}

function isOrderStatus(value?: string): value is string {
  return [
    "inquiry", "awaiting_confirmation", "confirmed", "queued", "preparing", "frying",
    "packed", "ready_for_pickup", "ready_for_booking", "booked", "completed", "cancelled"
  ].includes(value ?? "");
}

function parseManilaDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const start = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime())) return undefined;
  const end = addDays(start, 1);
  return { start, end };
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
