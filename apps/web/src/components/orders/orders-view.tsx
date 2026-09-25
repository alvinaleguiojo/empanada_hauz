"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CalendarDays, CheckCircle2, Clock3, Coins, LayoutGrid, List, Package, Pencil, Search, ShieldAlert, X } from "lucide-react";
import { OrdersBoard } from "@/components/orders/orders-board";
import { OrderFraudTagDialog } from "@/components/orders/order-fraud-tag-dialog";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { decodeRole, hasPermission, type UserRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const statusOptions = [
  "inquiry", "awaiting_confirmation", "confirmed", "queued", "preparing", "frying", "packed",
  "ready_for_pickup", "ready_for_booking", "booked", "completed", "cancelled"
] as const;

const statusLabels = Object.fromEntries(
  statusOptions.map((status) => [status, status.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())])
);

const statusTone: Record<string, string> = {
  inquiry: "bg-white/[0.08] text-foreground/75",
  awaiting_confirmation: "bg-amber-500/15 text-amber-200",
  confirmed: "bg-sky-500/15 text-sky-200",
  queued: "bg-violet-500/15 text-violet-200",
  preparing: "bg-fuchsia-500/15 text-fuchsia-200",
  frying: "bg-orange-500/15 text-orange-200",
  packed: "bg-cyan-500/15 text-cyan-200",
  ready_for_pickup: "bg-teal-500/15 text-teal-200",
  ready_for_booking: "bg-lime-500/15 text-lime-200",
  booked: "bg-emerald-500/15 text-emerald-200",
  completed: "bg-green-500/15 text-green-200",
  cancelled: "bg-rose-500/15 text-rose-200"
};

const statusDot: Record<string, string> = {
  inquiry: "bg-white/40",
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

const statusFilterOptions = [
  { label: "All Statuses", value: "all" },
  ...statusOptions.map((status) => ({ label: statusLabels[status], value: status }))
];

const deliveryOptions = [
  { label: "Pickup", value: "pickup" },
  { label: "Maxim", value: "maxim" },
  { label: "Own Rider", value: "own_delivery" }
];

const paymentOptions = [
  { label: "COD", value: "cod" },
  { label: "GCash", value: "gcash" }
];

const deliveryLabels: Record<string, string> = {
  pickup: "Pickup",
  maxim: "Maxim",
  own_delivery: "Own Rider"
};

type CalendarStatus = { status: string; eventId?: string | null; htmlLink?: string | null; error?: string | null; updatedAt?: string | null };

function CalendarSyncBadge({ order }: { order: any }) {
  if (!order.preferredSchedule) return null;
  const calendar = order.googleCalendarSync as CalendarStatus | undefined;
  const status = calendar?.status ?? "not_synced";
  const config: Record<string, { label: string; className: string }> = {
    syncing: { label: "Syncing", className: "bg-amber-500/15 text-amber-200" },
    synced: { label: "Synced", className: "bg-emerald-500/15 text-emerald-200" },
    skipped: { label: "Skipped", className: "bg-white/[0.08] text-foreground/55" },
    deleted: { label: "Removed", className: "bg-white/[0.08] text-foreground/55" },
    error: { label: "Sync error", className: "bg-rose-500/15 text-rose-200" },
    not_synced: { label: "Not synced", className: "bg-white/[0.08] text-foreground/55" }
  };
  const item = config[status] ?? config.not_synced;
  const content = (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", item.className)} title={calendar?.error ?? undefined}>
      <CalendarDays size={12} />
      {item.label}
    </span>
  );
  return calendar?.htmlLink && status === "synced" ? <a href={calendar.htmlLink} target="_blank" rel="noreferrer" aria-label="Open Google Calendar event">{content}</a> : content;
}

export function OrdersView({ orders }: { orders: Array<any> }) {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [fraudOrder, setFraudOrder] = useState<any | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [calendarStatuses, setCalendarStatuses] = useState<Record<string, CalendarStatus>>({});

  const orderIds = useMemo(() => orders.map((order) => order.id).filter(Boolean).join(","), [orders]);

  useEffect(() => {
    setRole(decodeRole(window.localStorage.getItem("empanada-token")));
  }, []);

  useEffect(() => {
    if (!orderIds) return;
    let active = true;
    const load = async () => {
      try {
        const result = await apiFetch<Record<string, CalendarStatus>>(`/orders/google-calendar/status?ids=${encodeURIComponent(orderIds)}`);
        if (active) setCalendarStatuses(result ?? {});
      } catch {
        // Calendar status is informational; don't block order management if Google is unavailable.
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [orderIds]);

  const ordersWithCalendar = useMemo(() => orders.map((order) => ({ ...order, googleCalendarSync: calendarStatuses[order.id] ?? order.googleCalendarSync })), [orders, calendarStatuses]);
  const canTagFraud = hasPermission(role, "fraud.manage");

  const activeOrders = ordersWithCalendar.filter((order) => !["completed", "cancelled"].includes(order.status)).length;
  const productionOrders = ordersWithCalendar.filter((order) => ["queued", "preparing", "frying", "packed"].includes(order.status)).length;
  const completedOrders = ordersWithCalendar.filter((order) => order.status === "completed").length;
  const revenue = ordersWithCalendar.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[26px] border border-white/8 bg-[radial-gradient(circle_at_90%_0%,rgba(255,103,61,0.16),transparent_30%),linear-gradient(145deg,#0b1220,#121b2d)] p-5 shadow-[0_28px_80px_-42px_rgba(0,0,0,0.75)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
                Live order desk
              </span>
              <span className="text-[11px] font-medium text-white/35">{ordersWithCalendar.length} loaded</span>
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Order operations</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">Monitor the pipeline, open an order, update its status, and keep delivery moving without leaving the workspace.</p>
          </div>
          <div className="inline-flex w-full rounded-xl border border-white/10 bg-black/15 p-1 backdrop-blur xl:w-auto" role="group" aria-label="Order view">
            <Button type="button" variant="ghost" aria-pressed={view === "kanban"} onClick={() => setView("kanban")} className={cn("h-10 flex-1 gap-2 rounded-lg px-4 font-semibold text-white/55 hover:bg-white/[0.06] hover:text-white xl:flex-none", view === "kanban" && "bg-white text-slate-900 hover:bg-white")}><LayoutGrid size={16} />Kanban</Button>
            <Button type="button" variant="ghost" aria-pressed={view === "list"} onClick={() => setView("list")} className={cn("h-10 flex-1 gap-2 rounded-lg px-4 font-semibold text-white/55 hover:bg-white/[0.06] hover:text-white xl:flex-none", view === "list" && "bg-white text-slate-900 hover:bg-white")}><List size={16} />List</Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OrderMetric label="All orders" value={ordersWithCalendar.length} meta="loaded in this view" icon={Package} />
          <OrderMetric label="Active" value={activeOrders} meta="still in the pipeline" icon={Activity} tone="accent" />
          <OrderMetric label="In production" value={productionOrders} meta="queued → packed" icon={Clock3} tone="warning" />
          <OrderMetric label="Completed" value={completedOrders} meta={`Php ${revenue.toLocaleString("en-US")} gross loaded`} icon={CheckCircle2} tone="success" />
        </div>
      </section>

      {view === "kanban" ? <OrdersBoard orders={ordersWithCalendar} /> : <OrdersList orders={ordersWithCalendar} onEdit={setEditingOrder} canTagFraud={canTagFraud} onFraud={setFraudOrder} />}
      {editingOrder ? <OrderEditModal order={editingOrder} onClose={() => setEditingOrder(null)} /> : null}
      {fraudOrder ? <OrderFraudTagDialog order={fraudOrder} onClose={() => { setFraudOrder(null); window.location.reload(); }} /> : null}
    </div>
  );
}

function OrderMetric({ label, value, meta, icon: Icon, tone = "neutral" }: { label: string; value: number; meta: string; icon: typeof Package; tone?: "neutral" | "accent" | "warning" | "success" }) {
  return (
    <div className={cn("rounded-2xl border px-4 py-3.5 backdrop-blur-md", tone === "accent" ? "border-orange-300/15 bg-orange-300/[0.06]" : tone === "warning" ? "border-amber-300/10 bg-amber-300/[0.04]" : tone === "success" ? "border-emerald-300/10 bg-emerald-300/[0.045]" : "border-white/[0.08] bg-white/[0.035]")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-white/35">{label}</p>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] text-white/55"><Icon size={15} /></span>
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight", tone === "accent" ? "text-orange-200" : tone === "warning" ? "text-amber-200" : tone === "success" ? "text-emerald-200" : "text-white")}>{value.toLocaleString("en-US")}</p>
      <p className="mt-1 text-[11px] text-white/30">{meta}</p>
    </div>
  );
}

function OrdersList({ orders, onEdit, canTagFraud, onFraud }: { orders: Array<any>; onEdit: (order: any) => void; canTagFraud: boolean; onFraud: (order: any) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => status === "all" || order.status === status).filter((order) => !query || [order.orderNumber, order.customer?.name, order.customer?.phoneNumber, order.deliveryMethod, order.location, order.address, order.status].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))).sort((a, b) => new Date(a.preferredSchedule ?? 0).getTime() - new Date(b.preferredSchedule ?? 0).getTime());
  }, [orders, search, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-foreground/35">{filtered.length} order{filtered.length === 1 ? "" : "s"}</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block sm:w-72"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders…" className="pl-9" /></label>
          <Select value={status} onChange={setStatus} options={statusFilterOptions} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.02] shadow-[0_20px_55px_-36px_rgba(0,0,0,0.8)]">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-white/8 bg-white/[0.025] text-[10px] uppercase tracking-[0.16em] text-foreground/40"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Schedule</th><th className="px-4 py-3">Calendar</th><th className="px-4 py-3">Delivery</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
          <tbody className="divide-y divide-line/60">
            {filtered.map((order) => (
              <tr key={order.id} className="transition hover:bg-white/[0.035]">
                <td className="whitespace-nowrap px-4 py-4 font-semibold">{order.orderNumber ?? order.id}</td>
                <td className="px-4 py-4"><div className="font-medium">{order.customer?.name ?? "Unknown customer"}</div><div className="mt-1 text-xs text-foreground/40">{order.customer?.phoneNumber ?? "No phone"}</div></td>
                <td className="whitespace-nowrap px-4 py-4 text-foreground/65">{formatSchedule(order.preferredSchedule)}</td>
                <td className="whitespace-nowrap px-4 py-4"><CalendarSyncBadge order={order} /></td>
                <td className="px-4 py-4 text-foreground/65">{deliveryLabels[order.deliveryMethod] ?? order.deliveryMethod ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-4 font-semibold">Php {String(order.totalAmount ?? 0)}</td>
                <td className="whitespace-nowrap px-4 py-4"><div className="flex items-center gap-2"><span className={cn("h-2 w-2 shrink-0 rounded-full", statusDot[order.status] ?? "bg-foreground/30")} /><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", statusTone[order.status] ?? "bg-white/[0.08] text-foreground/70")}>{statusLabels[order.status] ?? order.status ?? "Unknown"}</span></div></td>
                <td className="whitespace-nowrap px-4 py-4 text-right"><div className="flex justify-end gap-2">{canTagFraud ? <Button type="button" variant="secondary" className="h-9 gap-2 px-3 text-red-500 hover:bg-red-500/10" onClick={() => onFraud(order)}><ShieldAlert size={14} />Fraud</Button> : null}<Button type="button" variant="secondary" className="h-9 gap-2 px-3" onClick={() => onEdit(order)}><Pencil size={14} />Edit</Button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <div className="px-6 py-12 text-center text-sm text-foreground/45">No orders matched your filters.</div> : null}
      </div>
    </div>
  );
}

function OrderEditModal({ order, onClose }: { order: any; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    customerName: order.customer?.name ?? "", phoneNumber: order.customer?.phoneNumber ?? "", quantity: String(order.quantity ?? 0), unitPrice: String(order.unitPrice ?? 0), deliveryMethod: order.deliveryMethod ?? "pickup", paymentMethod: order.paymentMethod ?? "cod", deliveryFee: String(order.deliveryFee ?? 0), discountAmount: String(order.discountAmount ?? 0), location: order.location ?? "", address: order.address ?? "", preferredSchedule: order.preferredSchedule ? toInputDate(order.preferredSchedule) : "", notes: stripItemsBlock(order.notes ?? ""), status: order.status ?? "queued"
  });

  async function save() {
    setSaving(true); setError(null);
    try {
      const quantity = Math.max(0, Number(form.quantity || 0)); const unitPrice = Math.max(0, Number(form.unitPrice || 0));
      await apiFetch<any>(`/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ customerName: form.customerName.trim(), phoneNumber: form.phoneNumber.trim() || undefined, quantity, unitPrice, deliveryFee: Math.max(0, Number(form.deliveryFee || 0)), discountAmount: Math.max(0, Number(form.discountAmount || 0)), deliveryMethod: form.deliveryMethod, paymentMethod: form.paymentMethod, location: form.location.trim() || undefined, address: form.address.trim() || undefined, preferredSchedule: form.preferredSchedule ? new Date(form.preferredSchedule).toISOString() : undefined, notes: form.notes.trim() || undefined }) });
      if (form.status !== order.status) await apiFetch<any>(`/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: form.status }) });
      onClose(); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save order"); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close edit order dialog" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="absolute inset-y-0 right-0 w-full max-w-[520px] p-2 sm:p-4"><div className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line/70 px-4 py-4 sm:px-6"><div><p className="text-[10px] uppercase tracking-[0.2em] text-foreground/35">Edit Order</p><h3 className="mt-1 text-xl font-semibold">{order.customer?.name ?? order.orderNumber}</h3><p className="mt-1 text-xs text-foreground/40">{order.orderNumber}</p><div className="mt-2"><CalendarSyncBadge order={order} /></div></div><Button type="button" variant="ghost" className="h-9 w-9 p-0" onClick={onClose}><X size={18} /></Button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className="grid gap-3">
          <Input value={form.customerName} onChange={(e) => setForm((c) => ({ ...c, customerName: e.target.value }))} placeholder="Customer name" />
          <Input value={form.phoneNumber} onChange={(e) => setForm((c) => ({ ...c, phoneNumber: e.target.value }))} placeholder="Phone number" />
          <div className="grid gap-3 sm:grid-cols-2"><Input type="number" min="0" value={form.quantity} onChange={(e) => setForm((c) => ({ ...c, quantity: e.target.value }))} placeholder="Quantity" /><Input type="number" min="0" step="0.01" value={form.unitPrice} onChange={(e) => setForm((c) => ({ ...c, unitPrice: e.target.value }))} placeholder="Unit price" /><Select value={form.deliveryMethod} onChange={(value) => setForm((c) => ({ ...c, deliveryMethod: value }))} options={deliveryOptions} /><Select value={form.paymentMethod} onChange={(value) => setForm((c) => ({ ...c, paymentMethod: value }))} options={paymentOptions} /><Input type="number" min="0" step="0.01" value={form.deliveryFee} onChange={(e) => setForm((c) => ({ ...c, deliveryFee: e.target.value }))} placeholder="Delivery fee" /><Input type="number" min="0" step="0.01" value={form.discountAmount} onChange={(e) => setForm((c) => ({ ...c, discountAmount: e.target.value }))} placeholder="Discount" /></div>
          <Input value={form.location} onChange={(e) => setForm((c) => ({ ...c, location: e.target.value }))} placeholder="Area / Location" /><Input value={form.address} onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))} placeholder="Full address" /><Input type="datetime-local" value={form.preferredSchedule} onChange={(e) => setForm((c) => ({ ...c, preferredSchedule: e.target.value }))} /><Select value={form.status} onChange={(value) => setForm((c) => ({ ...c, status: value }))} options={statusFilterOptions.filter((option) => option.value !== "all")} /><textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Notes" className="min-h-28 w-full rounded-lg border border-line/80 bg-black/10 px-3.5 py-3 text-sm outline-none transition placeholder:text-foreground/38 hover:border-foreground/18 focus:border-accent/60" />
        </div>{error ? <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}</div>
        <div className="flex flex-col-reverse gap-2 border-t border-line/70 bg-panel p-4 sm:flex-row sm:justify-end sm:px-6"><Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button><Button type="button" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button></div>
      </div></div>
    </div>
  );
}

function toInputDate(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
function stripItemsBlock(value: string) { return value.replace(/\n?\[ITEMS\][\s\S]*?\[\/ITEMS\]\n?/i, "").trim(); }
function formatSchedule(value?: string | null) { if (!value) return "Not scheduled"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "Not scheduled"; return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date); }
