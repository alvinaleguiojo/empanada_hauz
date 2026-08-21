"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Search, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CalendarOrder = {
  id: string;
  orderNumber?: string | null;
  status?: string | null;
  totalAmount?: number | string | null;
  quantity?: number | null;
  deliveryMethod?: string | null;
  address?: string | null;
  location?: string | null;
  preferredSchedule?: string | null;
  customer?: { name?: string | null; phoneNumber?: string | null } | null;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_TONES: Record<string, string> = {
  inquiry: "border-white/10 bg-white/[0.07] text-foreground/70",
  awaiting_confirmation: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  confirmed: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  queued: "border-violet-400/20 bg-violet-400/10 text-violet-200",
  preparing: "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200",
  frying: "border-orange-400/20 bg-orange-400/10 text-orange-200",
  packed: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
  ready_for_pickup: "border-teal-400/20 bg-teal-400/10 text-teal-200",
  ready_for_booking: "border-lime-400/20 bg-lime-400/10 text-lime-200",
  booked: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  completed: "border-green-400/20 bg-green-400/10 text-green-200",
  cancelled: "border-rose-400/20 bg-rose-400/10 text-rose-200"
};
const STATUS_DOTS: Record<string, string> = {
  inquiry: "bg-white/45",
  awaiting_confirmation: "bg-amber-400",
  confirmed: "bg-sky-400",
  queued: "bg-violet-400",
  preparing: "bg-fuchsia-400",
  frying: "bg-orange-400",
  packed: "bg-cyan-400",
  ready_for_pickup: "bg-teal-400",
  ready_for_booking: "bg-lime-400",
  booked: "bg-emerald-400",
  completed: "bg-green-400",
  cancelled: "bg-rose-400"
};

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatStatus(status?: string | null) {
  return (status ?? "scheduled").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDeliveryMethod(method?: string | null) {
  if (method === "own_delivery") return "Own Rider";
  if (method === "maxim") return "Maxim";
  return "Pickup";
}

function money(value?: number | string | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? `₱${amount.toLocaleString("en-PH", { maximumFractionDigits: 0 })}` : "—";
}

function calendarDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  first.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
}

export function OrdersCalendar({ orders }: { orders: CalendarOrder[] }) {
  const now = new Date();
  const [viewDate, setViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedId, setSelectedId] = useState<string | null>(orders[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const scheduledOrders = useMemo(
    () => orders
      .filter((order) => order.preferredSchedule && !["completed", "cancelled"].includes(order.status ?? ""))
      .sort((a, b) => new Date(a.preferredSchedule!).getTime() - new Date(b.preferredSchedule!).getTime()),
    [orders]
  );

  const statuses = useMemo(() => Array.from(new Set(scheduledOrders.map((order) => order.status).filter(Boolean))), [scheduledOrders]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return scheduledOrders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (!query) return true;
      return [order.orderNumber, order.customer?.name, order.customer?.phoneNumber, order.address, order.location]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [scheduledOrders, search, statusFilter]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarOrder[]>();
    for (const order of filteredOrders) {
      const key = dateKey(new Date(order.preferredSchedule!));
      map.set(key, [...(map.get(key) ?? []), order]);
    }
    return map;
  }, [filteredOrders]);

  const days = useMemo(() => calendarDays(viewDate.getFullYear(), viewDate.getMonth()), [viewDate]);
  const selectedOrder = filteredOrders.find((order) => order.id === selectedId) ?? filteredOrders[0] ?? null;
  const todayKey = dateKey(now);
  const visibleMonth = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}`;

  function moveMonth(delta: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function goToday() {
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Button type="button" variant="outline" onClick={goToday}>Today</Button>
            <div className="flex items-center rounded-lg border border-white/[0.09] bg-white/[0.025]">
              <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month" className="grid h-9 w-9 place-items-center text-foreground/60 transition hover:bg-white/[0.06] hover:text-foreground"><ChevronLeft size={17} /></button>
              <button type="button" onClick={() => moveMonth(1)} aria-label="Next month" className="grid h-9 w-9 place-items-center border-l border-white/[0.08] text-foreground/60 transition hover:bg-white/[0.06] hover:text-foreground"><ChevronRight size={17} /></button>
            </div>
            <h2 className="ml-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">{monthFormatter.format(viewDate)}</h2>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders" className="pl-9" />
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-white/[0.09] bg-[#101827] px-3 text-sm text-foreground outline-none focus:border-accent/60">
              <option value="all">All statuses</option>
              {statuses.map((status) => <option key={status} value={status!}>{formatStatus(status)}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-white/[0.08] bg-white/[0.025]">
            {WEEKDAYS.map((day) => <div key={day} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/42">{day}</div>)}
          </div>
          <div className="grid grid-cols-7 auto-rows-[minmax(112px,1fr)]">
            {days.map((day) => {
              const key = dateKey(day);
              const isCurrentMonth = key.startsWith(visibleMonth);
              const isToday = key === todayKey;
              const dayOrders = byDate.get(key) ?? [];
              return (
                <div key={key} className={cn("min-w-0 border-b border-r border-white/[0.065] p-1.5 sm:p-2", !isCurrentMonth && "bg-white/[0.012]", isToday && "bg-accent/[0.035]")}>
                  <div className="mb-1 flex h-6 items-center justify-between">
                    <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs", isToday ? "bg-accent font-semibold text-white" : isCurrentMonth ? "text-foreground/70" : "text-foreground/25")}>{day.getDate()}</span>
                    {dayOrders.length > 0 ? <span className="text-[10px] text-foreground/35">{dayOrders.length}</span> : null}
                  </div>
                  <div className="space-y-1">
                    {dayOrders.slice(0, 3).map((order) => {
                      const status = order.status ?? "scheduled";
                      return (
                        <button key={order.id} type="button" onClick={() => setSelectedId(order.id)} className={cn("group block w-full rounded-md border px-1.5 py-1 text-left transition hover:-translate-y-px hover:border-accent/40", STATUS_TONES[status] ?? STATUS_TONES.inquiry, selectedId === order.id && "ring-1 ring-accent/65")}>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOTS[status] ?? "bg-accent")} />
                            <span className="truncate text-[11px] font-semibold">{timeFormatter.format(new Date(order.preferredSchedule!))} · {order.customer?.name || order.orderNumber || "Order"}</span>
                          </div>
                          <p className="mt-0.5 truncate pl-3 text-[10px] opacity-65">{order.quantity ?? 0} pcs · {formatDeliveryMethod(order.deliveryMethod)}</p>
                        </button>
                      );
                    })}
                    {dayOrders.length > 3 ? <button type="button" onClick={() => setSelectedId(dayOrders[3].id)} className="px-1.5 text-[10px] font-semibold text-accent hover:underline">+{dayOrders.length - 3} more</button> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="h-fit xl:sticky xl:top-4">
          <div className="flex items-center gap-2 border-b border-white/[0.08] pb-4">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent"><CalendarDays size={18} /></div>
            <div><p className="text-xs uppercase tracking-[0.16em] text-foreground/40">Upcoming orders</p><p className="text-lg font-semibold">{filteredOrders.length}</p></div>
          </div>
          {selectedOrder ? (
            <div className="space-y-4 pt-4">
              <div>
                <p className="text-xs text-foreground/40">{selectedOrder.orderNumber ?? "Order"}</p>
                <h3 className="mt-1 text-xl font-semibold">{selectedOrder.customer?.name || "Customer"}</h3>
                <div className="mt-2"><Badge className={STATUS_TONES[selectedOrder.status ?? ""] ?? STATUS_TONES.inquiry}>{formatStatus(selectedOrder.status)}</Badge></div>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex gap-3"><Clock3 size={16} className="mt-0.5 shrink-0 text-accent" /><div><p className="font-medium">{new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(selectedOrder.preferredSchedule!))}</p><p className="text-xs text-foreground/42">Asia/Manila</p></div></div>
                <div className="flex gap-3"><Truck size={16} className="mt-0.5 shrink-0 text-accent" /><div><p className="font-medium">{formatDeliveryMethod(selectedOrder.deliveryMethod)}</p><p className="text-xs text-foreground/42">{selectedOrder.quantity ?? 0} pieces · {money(selectedOrder.totalAmount)}</p></div></div>
                {selectedOrder.address || selectedOrder.location ? <div className="flex gap-3"><MapPin size={16} className="mt-0.5 shrink-0 text-accent" /><p className="leading-5 text-foreground/70">{[selectedOrder.location, selectedOrder.address].filter(Boolean).join(" · ")}</p></div> : null}
              </div>
              <Link href="/orders" className="block"><Button type="button" className="w-full">Open Orders</Button></Link>
            </div>
          ) : <div className="py-10 text-center text-sm text-foreground/42">No upcoming orders match your filters.</div>}
        </Card>
      </div>
    </div>
  );
}
