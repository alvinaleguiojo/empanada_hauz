"use client";

import { useEffect, useMemo, useState } from "react";
import { List, LayoutGrid, Search, Clock3, MapPin } from "lucide-react";
import { OrdersBoard } from "@/components/orders/orders-board";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const statusOptions = [
  "inquiry", "awaiting_confirmation", "confirmed", "queued", "preparing", "frying", "packed",
  "ready_for_pickup", "ready_for_booking", "booked", "completed", "cancelled"
] as const;

const statusTone: Record<string, string> = {
  inquiry: "bg-white/[0.08] text-foreground/75", awaiting_confirmation: "bg-amber-500/15 text-amber-200", confirmed: "bg-sky-500/15 text-sky-200",
  queued: "bg-violet-500/15 text-violet-200", preparing: "bg-fuchsia-500/15 text-fuchsia-200", frying: "bg-orange-500/15 text-orange-200",
  packed: "bg-cyan-500/15 text-cyan-200", ready_for_pickup: "bg-teal-500/15 text-teal-200", ready_for_booking: "bg-lime-500/15 text-lime-200",
  booked: "bg-emerald-500/15 text-emerald-200", completed: "bg-green-500/15 text-green-200", cancelled: "bg-rose-500/15 text-rose-200"
};
const statusDot: Record<string, string> = {
  inquiry: "bg-white/40", awaiting_confirmation: "bg-amber-400", confirmed: "bg-sky-400", queued: "bg-violet-400", preparing: "bg-fuchsia-400",
  frying: "bg-orange-400", packed: "bg-cyan-400", ready_for_pickup: "bg-teal-400", ready_for_booking: "bg-lime-400", booked: "bg-emerald-400",
  completed: "bg-green-400", cancelled: "bg-rose-400"
};
const deliveryLabels: Record<string, string> = { pickup: "Pickup", maxim: "Maxim", own_delivery: "Own Rider" };
const statusSelectOptions = statusOptions.map((status) => ({ label: status.replaceAll("_", " ").replace(/\\b\\w/g, (char) => char.toUpperCase()), value: status }));
const statusFilterOptions = [{ label: "All Statuses", value: "all" }, ...statusSelectOptions];

export function OrdersView({ orders }: { orders: Array<any> }) {
  const [view, setView] = useState<"kanban" | "list">("kanban");

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-line/80 bg-panel/80 p-1 shadow-sm" role="group" aria-label="Order view">
          <Button type="button" variant="ghost" aria-pressed={view === "kanban"} onClick={() => setView("kanban")} className={cn("h-9 gap-2 px-3", view === "kanban" && "bg-accent/[0.12] text-accent hover:bg-accent/[0.16]")}>
            <LayoutGrid size={15} /> Kanban
          </Button>
          <Button type="button" variant="ghost" aria-pressed={view === "list"} onClick={() => setView("list")} className={cn("h-9 gap-2 px-3", view === "list" && "bg-accent/[0.12] text-accent hover:bg-accent/[0.16]")}>
            <List size={15} /> List
          </Button>
        </div>
      </div>
      {view === "kanban" ? <OrdersBoard orders={orders} /> : <OrdersList initialOrders={orders} />}
    </div>
  );
}

function OrdersList({ initialOrders }: { initialOrders: Array<any> }) {
  const [items, setItems] = useState(initialOrders);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialOrders);
  }, [initialOrders]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        else if (selectedDate) params.set("date", selectedDate);
        const result = await apiFetch<any[]>(`/orders${params.toString() ? `?${params.toString()}` : ""}`);
        if (!cancelled) setItems(Array.isArray(result) ? result : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to refresh orders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search.trim() ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [search, selectedDate]);

  const filtered = useMemo(() => items
    .filter((order) => statusFilter === "all" || order.status === statusFilter)
    .sort((a, b) => getTime(a.preferredSchedule) - getTime(b.preferredSchedule)), [items, statusFilter]);

  async function updateStatus(order: any, status: string) {
    setError(null);
    try {
      const updated = await apiFetch<any>(`/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update status");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">List View</p><p className="mt-1 text-sm text-foreground/50">{loading ? "Refreshing orders…" : `${filtered.length} order${filtered.length === 1 ? "" : "s"}`}</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="relative block sm:w-[300px]"><Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/35" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search orders…" className="pl-9" /></label>
          <Select value={statusFilter} onChange={setStatusFilter} options={statusFilterOptions} />
          <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </div>
      </div>
      {error ? <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-line/80 bg-panel/70 shadow-sm">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-line/80 bg-black/[0.08] text-[10px] uppercase tracking-[0.16em] text-foreground/35">
            <tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Schedule</th><th className="px-4 py-3">Delivery</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-line/65">
            {filtered.map((order) => <ListRow key={order.id} order={order} onStatusChange={updateStatus} />)}
          </tbody>
        </table>
        {filtered.length === 0 ? <div className="px-6 py-14 text-center text-sm text-foreground/45">No orders matched your filters.</div> : null}
      </div>
    </div>
  );
}

function ListRow({ order, onStatusChange }: { order: any; onStatusChange: (order: any, status: string) => Promise<void> }) {
  const lineItems = Array.isArray(order.items) ? order.items : [];
  const itemText = lineItems.length > 0 ? lineItems.map((item: any) => `${item.name ?? "Item"} × ${item.quantity ?? 0}`).join(", ") : `${order.quantity ?? 0} pcs`;
  return <tr className="align-middle transition hover:bg-white/[0.025]">
    <td className="whitespace-nowrap px-4 py-4"><p className="font-semibold">{order.orderNumber}</p><p className="mt-1 text-[11px] text-foreground/35">{order.id}</p></td>
    <td className="px-4 py-4"><p className="font-medium">{order.customer?.name ?? "Unknown customer"}</p><p className="mt-1 text-xs text-foreground/45">{order.customer?.phoneNumber ?? "No phone"}</p></td>
    <td className="max-w-[260px] px-4 py-4"><p className="truncate text-foreground/75" title={itemText}>{itemText}</p></td>
    <td className="whitespace-nowrap px-4 py-4"><div className="flex items-center gap-1.5 text-foreground/60"><Clock3 size={13} />{formatSchedule(order.preferredSchedule)}</div></td>
    <td className="px-4 py-4"><div className="flex items-start gap-1.5 text-foreground/60"><MapPin size={13} className="mt-0.5 shrink-0" /><span><span className="font-medium text-foreground/75">{deliveryLabels[order.deliveryMethod] ?? order.deliveryMethod ?? "—"}</span><br /><span className="text-xs">{order.location ?? order.address ?? "No area"}</span></span></div></td>
    <td className="whitespace-nowrap px-4 py-4 font-semibold">Php {String(order.totalAmount ?? 0)}</td>
    <td className="px-4 py-4"><div className="flex items-center gap-2"><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDot[order.status])} /><Select value={order.status} onChange={(status) => void onStatusChange(order, status)} options={statusSelectOptions} className={cn("min-w-[170px]", statusTone[order.status])} /></div></td>
  </tr>;
}

function getTodayDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
function getTime(value?: string | null) { if (!value) return Number.MAX_SAFE_INTEGER; const time = new Date(value).getTime(); return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time; }
function formatSchedule(value?: string | null) { if (!value) return "Not scheduled"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "Not scheduled"; return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date); }
