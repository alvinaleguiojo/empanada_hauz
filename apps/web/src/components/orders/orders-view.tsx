"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List, Search } from "lucide-react";
import { OrdersBoard } from "@/components/orders/orders-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const statusOptions = [
  "inquiry", "awaiting_confirmation", "confirmed", "queued", "preparing", "frying", "packed",
  "ready_for_pickup", "ready_for_booking", "booked", "completed", "cancelled"
] as const;

const statusLabels = Object.fromEntries(
  statusOptions.map((status) => [status, status.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())])
);

const statusFilterOptions = [
  { label: "All Statuses", value: "all" },
  ...statusOptions.map((status) => ({ label: statusLabels[status], value: status }))
];

const deliveryLabels: Record<string, string> = {
  pickup: "Pickup",
  maxim: "Maxim",
  own_delivery: "Own Rider"
};

export function OrdersView({ orders }: { orders: Array<any> }) {
  const [view, setView] = useState<"kanban" | "list">("kanban");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-line/70 pb-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/45">Orders</p>
          <p className="text-sm text-foreground/45">Choose how you want to manage today's orders.</p>
        </div>
        <div className="inline-flex shrink-0 rounded-lg border-2 border-line bg-panel p-1 shadow-sm" role="group" aria-label="Order view">
          <Button
            type="button"
            variant="ghost"
            aria-pressed={view === "kanban"}
            onClick={() => setView("kanban")}
            className={cn("h-9 gap-2 px-4 font-semibold", view === "kanban" && "bg-accent text-white hover:bg-accent/90")}
          >
            <LayoutGrid size={16} />
            Kanban
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            className={cn("h-9 gap-2 px-4 font-semibold", view === "list" && "bg-accent text-white hover:bg-accent/90")}
          >
            <List size={16} />
            List
          </Button>
        </div>
      </div>

      {view === "kanban" ? <OrdersBoard orders={orders} /> : <OrdersList orders={orders} />}
    </div>
  );
}

function OrdersList({ orders }: { orders: Array<any> }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders
      .filter((order) => status === "all" || order.status === status)
      .filter((order) => !query || [
        order.orderNumber,
        order.customer?.name,
        order.customer?.phoneNumber,
        order.deliveryMethod,
        order.location,
        order.address,
        order.status
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)))
      .sort((a, b) => new Date(a.preferredSchedule ?? 0).getTime() - new Date(b.preferredSchedule ?? 0).getTime());
  }, [orders, search, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-foreground/50">{filtered.length} order{filtered.length === 1 ? "" : "s"}</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block sm:w-72">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders…" className="pl-9" />
          </label>
          <Select value={status} onChange={setStatus} options={statusFilterOptions} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line/80 bg-panel/70">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line/80 bg-black/[0.08] text-[10px] uppercase tracking-[0.16em] text-foreground/40">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Schedule</th>
              <th className="px-4 py-3">Delivery</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {filtered.map((order) => (
              <tr key={order.id} className="hover:bg-white/[0.025]">
                <td className="whitespace-nowrap px-4 py-4 font-semibold">{order.orderNumber ?? order.id}</td>
                <td className="px-4 py-4">
                  <div className="font-medium">{order.customer?.name ?? "Unknown customer"}</div>
                  <div className="mt-1 text-xs text-foreground/40">{order.customer?.phoneNumber ?? "No phone"}</div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-foreground/65">{formatSchedule(order.preferredSchedule)}</td>
                <td className="px-4 py-4 text-foreground/65">{deliveryLabels[order.deliveryMethod] ?? order.deliveryMethod ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-4 font-semibold">Php {String(order.totalAmount ?? 0)}</td>
                <td className="whitespace-nowrap px-4 py-4">
                  <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">{statusLabels[order.status] ?? order.status ?? "Unknown"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <div className="px-6 py-12 text-center text-sm text-foreground/45">No orders matched your filters.</div> : null}
      </div>
    </div>
  );
}

function formatSchedule(value?: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
