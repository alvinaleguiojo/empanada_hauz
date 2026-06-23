"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ArrowRight, Check, ChevronRight, Clock3, Copy, ExternalLink, Link2, MapPin, Minus, Plus, Search, Trash2, UploadCloud } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const columns = [
  "inquiry",
  "awaiting_confirmation",
  "confirmed",
  "queued",
  "preparing",
  "frying",
  "packed",
  "ready_for_pickup",
  "ready_for_booking",
  "booked",
  "completed",
  "cancelled"
] as const;

const statusOptions = [
  "inquiry",
  "awaiting_confirmation",
  "confirmed",
  "queued",
  "preparing",
  "frying",
  "packed",
  "ready_for_pickup",
  "ready_for_booking",
  "booked",
  "completed",
  "cancelled"
] as const;

const deliveryOptions = ["pickup", "maxim"] as const;
const deliverySelectOptions = deliveryOptions.map((option) => ({
  label: option.charAt(0).toUpperCase() + option.slice(1),
  value: option
}));
const paymentOptions = ["cod", "gcash"] as const;
const paymentSelectOptions = paymentOptions.map((option) => ({
  label: option === "cod" ? "COD" : "GCash",
  value: option
}));
const statusSelectOptions = statusOptions.map((status) => ({
  label: status.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()),
  value: status
}));
const statusFilterOptions = [
  { label: "All Statuses", value: "all" },
  ...statusSelectOptions
];

const productOptions = [
  { label: "Pork Regular", value: "Pork Regular", price: 20 },
  { label: "Pork with Egg", value: "Pork with Egg", price: 25 },
  { label: "Ham & Cheese", value: "Ham & Cheese", price: 25 },
  { label: "Chicken", value: "Chicken", price: 20 },
  { label: "Ube with Cheese", value: "Ube with Cheese", price: 25 },
  { label: "Choco Flavor", value: "Choco Flavor", price: 25 },
  { label: "Mango Flavor", value: "Mango Flavor", price: 25 }
];

type OrderNoteView = {
  id: string;
  body: string;
  createdAt?: string | null;
};

type OrderLineItemView = {
  name: string;
  quantity: number;
  price?: number;
  subtotal?: number;
};

type EditableOrderLineItem = {
  productName: string;
  quantity: string;
  price: number;
};

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

const scheduleFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const noteTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

export function OrdersBoard({ orders }: { orders: Array<any> }) {
  const [items, setItems] = useState(orders);
  const [selectedId, setSelectedId] = useState<string | null>(orders[0]?.id ?? null);
  const [selectedStatus, setSelectedStatus] = useState<string>(orders[0]?.status ?? "queued");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(getTodayDateInputValue);
  const [statusFilter, setStatusFilter] = useState("all");
  const [editMode, setEditMode] = useState(false);
  const [copiedDetails, setCopiedDetails] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [copiedNotes, setCopiedNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const [exportPending, startExportTransition] = useTransition();
  const [exportResult, setExportResult] = useState<{ name: string; webViewLink?: string } | null>(null);
  const [form, setForm] = useState({
    customerName: "",
    phoneNumber: "",
    deliveryFee: "0",
    deliveryMethod: "pickup",
    paymentMethod: "cod",
    location: "",
    address: "",
    preferredSchedule: "",
    maximStatus: "booked",
    maximScheduledAt: "",
    maximEta: "",
    maximTrackingLink: "",
    maximRiderName: "",
    maximRiderPlate: "",
    maximBookingNotes: "",
    notes: ""
  });
  const [lineItems, setLineItems] = useState<EditableOrderLineItem[]>(() => createEditableLineItems());

  const refreshOrders = useCallback(async () => {
    const refreshed = await apiFetch<any[]>("/orders");
    setItems(refreshed);
    setSelectedId((current) => {
      if (!current) {
        return refreshed[0]?.id ?? null;
      }

      return refreshed.some((order) => order.id === current) ? current : refreshed[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    setItems(orders);
    if (!selectedId && orders[0]?.id) {
      setSelectedId(orders[0].id);
    }
  }, [orders, selectedId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (editMode) {
        return;
      }

      refreshOrders().catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to refresh orders");
      });
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [editMode, refreshOrders]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        !query ||
        [
          item.customer?.name,
          item.customer?.phoneNumber,
          item.orderNumber,
          item.deliveryMethod,
          item.paymentMethod,
          item.status,
          item.location,
          item.address,
          item.notes,
          ...(item.orderNotes ?? []).map((note: any) => note.body)
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      const matchesDate =
        !selectedDate ||
        (item.preferredSchedule ? toInputDate(item.preferredSchedule).slice(0, 10) === selectedDate : false);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;

      return matchesSearch && matchesDate && matchesStatus;
    }).sort(compareOrdersBySchedule);
  }, [items, search, selectedDate, statusFilter]);

  const selectedOrder = useMemo(
    () => filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null,
    [filteredItems, selectedId]
  );

  useEffect(() => {
    if (selectedOrder?.id !== selectedId) {
      setSelectedId(selectedOrder?.id ?? null);
    }
  }, [selectedId, selectedOrder]);

  useEffect(() => {
    if (selectedOrder) {
      setSelectedStatus(selectedOrder.status);
      setForm({
        customerName: selectedOrder.customer?.name ?? "",
        phoneNumber: selectedOrder.customer?.phoneNumber ?? "",
        deliveryFee: String(selectedOrder.deliveryFee ?? 0),
        deliveryMethod: selectedOrder.deliveryMethod ?? "pickup",
        paymentMethod: selectedOrder.paymentMethod ?? "cod",
        location: selectedOrder.location ?? "",
        address: selectedOrder.address ?? "",
        preferredSchedule: selectedOrder.preferredSchedule ? toInputDate(selectedOrder.preferredSchedule) : getLocalDateTimeInputValue(),
        maximStatus: ["booked", "completed", "cancelled"].includes(selectedOrder.delivery?.status) ? selectedOrder.delivery.status : "booked",
        maximScheduledAt: selectedOrder.delivery?.scheduledAt ? toInputDate(selectedOrder.delivery.scheduledAt) : getLocalDateTimeInputValue(),
        maximEta: selectedOrder.delivery?.eta ? toInputDate(selectedOrder.delivery.eta) : "",
        maximTrackingLink: selectedOrder.delivery?.trackingLink ?? "",
        maximRiderName: selectedOrder.delivery?.riderName ?? "",
        maximRiderPlate: selectedOrder.delivery?.riderPlate ?? "",
        maximBookingNotes: selectedOrder.delivery?.bookingNotes ?? "",
        notes: stripItemsBlock(selectedOrder.notes ?? "")
      });
      setLineItems(createEditableLineItems(selectedOrder));
      setEditMode(false);
      setError(null);
      setCopiedDetails(false);
      setCopiedTracking(false);
      setCopiedNotes(false);
      setNoteDraft("");
    }
  }, [selectedOrder]);

  const totals = useMemo(
    () => ({
      totalOrders: items.length,
      visibleOrders: filteredItems.length
    }),
    [filteredItems.length, items.length]
  );

  const visibleColumns = useMemo(() => {
    if (filteredItems.length === 0) {
      return [];
    }

    const active = columns.filter(
      (status) => filteredItems.some((item) => item.status === status) || selectedOrder?.status === status
    );
    return active.length > 0 ? active : ["queued", "ready_for_booking", "booked"];
  }, [filteredItems, selectedOrder]);

  const countLabel = useMemo(() => {
    if (search.trim() || statusFilter !== "all" || selectedDate) {
      return `${totals.visibleOrders} of ${totals.totalOrders}`;
    }

    return `${totals.totalOrders} orders`;
  }, [search, selectedDate, statusFilter, totals.totalOrders, totals.visibleOrders]);

  const orderItemSummary = useMemo(() => {
    const items = lineItems
      .map((item) => {
        const quantity = Number(item.quantity || 0);
        return quantity > 0
          ? {
              name: item.productName,
              quantity,
              price: item.price,
              subtotal: quantity * item.price
            }
          : null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const deliveryFee = form.deliveryMethod === "maxim" ? Number(form.deliveryFee || 0) : 0;

    return {
      items,
      quantity,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      unitPrice: quantity > 0 ? subtotal / quantity : 0
    };
  }, [form.deliveryFee, form.deliveryMethod, lineItems]);

  function updateStatus() {
    if (!selectedOrder) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const updated = await apiFetch<any>(`/orders/${selectedOrder.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: selectedStatus })
        });
        setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to update status");
      }
    });
  }

  function saveDetails() {
    if (!selectedOrder) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        if (orderItemSummary.quantity < 1) {
          setError("Add at least one item quantity before saving.");
          return;
        }

        let updated = await apiFetch<any>(`/orders/${selectedOrder.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            customerName: form.customerName,
            phoneNumber: form.phoneNumber || undefined,
            quantity: orderItemSummary.quantity,
            unitPrice: orderItemSummary.unitPrice,
            deliveryFee: orderItemSummary.deliveryFee,
            items: orderItemSummary.items,
            deliveryMethod: form.deliveryMethod,
            paymentMethod: form.paymentMethod,
            location: form.location || undefined,
            address: form.address || undefined,
            preferredSchedule: form.preferredSchedule ? new Date(form.preferredSchedule).toISOString() : undefined,
            notes: form.notes.trim() || undefined
          })
        });

        if (shouldSaveMaximTracking()) {
          updated = await apiFetch<any>(`/deliveries/orders/${selectedOrder.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: form.maximStatus,
              scheduledAt: form.maximScheduledAt ? new Date(form.maximScheduledAt).toISOString() : undefined,
              eta: form.maximEta ? new Date(form.maximEta).toISOString() : undefined,
              trackingLink: form.maximTrackingLink || undefined,
              riderName: form.maximRiderName || undefined,
              riderPlate: form.maximRiderPlate || undefined,
              bookingNotes: form.maximBookingNotes || undefined
            })
          });
        }

        await refreshOrders();
        setSelectedId(updated.id);
        setEditMode(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to save order details");
      }
    });
  }

  function shouldSaveMaximTracking() {
    return (
      Boolean(selectedOrder?.delivery) ||
      Boolean(
        form.maximTrackingLink.trim() ||
          form.maximRiderName.trim() ||
          form.maximRiderPlate.trim() ||
          form.maximBookingNotes.trim() ||
          form.maximEta
      )
    );
  }

  function shouldShowMaximTrackingFields() {
    return (
      form.deliveryMethod === "maxim" ||
      selectedStatus === "ready_for_booking" ||
      selectedStatus === "booked" ||
      selectedOrder?.deliveryMethod === "maxim" ||
      Boolean(selectedOrder?.delivery)
    );
  }

  function updateLineItem(productName: string, quantity: string) {
    const normalized = quantity === "" ? "" : String(Math.max(0, Number(quantity)));
    setLineItems((current) =>
      current.map((item) => (item.productName === productName ? { ...item, quantity: normalized } : item))
    );
  }

  function stepLineItem(productName: string, delta: number) {
    setLineItems((current) =>
      current.map((item) => {
        if (item.productName !== productName) {
          return item;
        }
        const nextQuantity = Math.max(0, Number(item.quantity || 0) + delta);
        return { ...item, quantity: nextQuantity > 0 ? String(nextQuantity) : "" };
      })
    );
  }

  function addNote() {
    if (!selectedOrder) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const updated = await apiFetch<any>(`/orders/${selectedOrder.id}/notes`, {
          method: "POST",
          body: JSON.stringify({ body: noteDraft })
        });
        setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setNoteDraft("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to add note");
      }
    });
  }

  async function copyNotes() {
    const text = getOrderNotes(selectedOrder).map((note) => note.body).join("\n\n");
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedNotes(true);
      window.setTimeout(() => setCopiedNotes(false), 1600);
    } catch {
      setCopiedNotes(false);
    }
  }

  async function copyOrderDetails() {
    if (!selectedOrder) {
      return;
    }

    try {
      await navigator.clipboard.writeText(formatOrderDetailsForCopy(selectedOrder));
      setCopiedDetails(true);
      window.setTimeout(() => setCopiedDetails(false), 1600);
    } catch {
      setCopiedDetails(false);
    }
  }

  async function copyTrackingLink() {
    if (!selectedOrder || typeof window === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(`${window.location.origin}/track/${selectedOrder.id}`);
      setCopiedTracking(true);
      window.setTimeout(() => setCopiedTracking(false), 1600);
    } catch {
      setCopiedTracking(false);
    }
  }

  function exportOrdersToExcel() {
    setError(null);
    setExportResult(null);
    startExportTransition(async () => {
      try {
        const result = await apiFetch<{ name: string; webViewLink?: string }>("/orders/export/google-drive", {
          method: "POST",
          body: JSON.stringify({ orderIds: filteredItems.map((order) => order.id) })
        });
        setExportResult(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to upload export to Google Drive");
      }
    });
  }

  function deleteOrder() {
    if (!selectedOrder) {
      return;
    }

    const confirmed = window.confirm(`Delete order ${selectedOrder.orderNumber}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setError(null);
    startDeleteTransition(async () => {
      try {
        await apiFetch(`/orders/${selectedOrder.id}`, { method: "DELETE" });
        setItems((current) => current.filter((item) => item.id !== selectedOrder.id));
        setSelectedId((current) => (current === selectedOrder.id ? null : current));
        setDetailOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to delete order");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/35">Operations Board</p>
          <h2 className="mt-1 text-xl font-semibold sm:text-2xl">Order Workflow</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:items-center">
          <label className="relative block min-w-0 sm:w-[320px]">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer, order no., area, phone, or notes"
              className="pl-10 sm:h-11"
            />
          </label>
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusFilterOptions}
            className="sm:w-[220px]"
          />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full sm:h-11 sm:w-[168px]"
          />
          <Button
            type="button"
            variant="ghost"
            onClick={exportOrdersToExcel}
            disabled={filteredItems.length === 0 || exportPending}
            className="h-11 justify-center gap-2 border border-line/80 px-4"
          >
            <UploadCloud size={16} />
            {exportPending ? "Uploading..." : "Upload Excel"}
          </Button>
          <Badge className="justify-center border border-line/70 bg-panel text-foreground/70 sm:justify-start">
            {countLabel}
          </Badge>
        </div>
      </div>
      {exportResult ? (
        <div className="rounded-lg border border-line/80 bg-panel/70 px-4 py-3 text-sm text-foreground/70">
          Uploaded <span className="font-medium text-foreground">{exportResult.name}</span> to Google Drive.
          {exportResult.webViewLink ? (
            <a className="ml-2 text-accent hover:underline" href={exportResult.webViewLink} target="_blank" rel="noreferrer">
              Open file
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="min-w-0 overflow-x-auto rounded-lg border border-line/80 bg-panel/55 p-2 pb-3 shadow-sm shadow-black/10 sm:p-3 sm:pb-4">
        <div className="grid min-w-full grid-flow-col auto-cols-[minmax(224px,85vw)] gap-3 sm:auto-cols-[minmax(248px,1fr)]">
          {visibleColumns.map((status) => {
            const columnOrders = filteredItems.filter((item) => item.status === status);
            const columnQuantity = columnOrders.reduce((sum, order) => sum + Number(order.quantity ?? 0), 0);
            return (
              <Card key={status} className="min-w-[224px] border-line/70 bg-panel/90 p-3 shadow-none sm:min-w-[248px]">
                <div className="mb-3 flex items-center justify-between border-b border-line/70 pb-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/30">Stage</p>
                    <h3 className="mt-1 text-[15px] font-semibold capitalize leading-tight">{status.replaceAll("_", " ")}</h3>
                    <p className="mt-1 text-xs text-foreground/45">{columnQuantity} pcs total</p>
                  </div>
                  <Badge className={cn("border-0", statusTone[status])}>{columnOrders.length}</Badge>
                </div>
                <div className="space-y-2.5">
                  {columnOrders.map((order) => {
                    const orderLineItems = getOrderLineItems(order);
                    const notePreview = getOrderNotePreview(order);
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(order.id);
                          setDetailOpen(true);
                        }}
                        className={cn(
                          "w-full rounded-lg border px-3.5 py-3 text-left transition",
                          selectedOrder?.id === order.id
                            ? "border-accent/60 bg-accent/[0.08] shadow-[0_0_0_1px_rgb(var(--accent)/0.18)]"
                            : "border-line/70 bg-black/[0.08] hover:border-accent/35 hover:bg-white/[0.04]"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[17px] font-semibold leading-tight">{order.customer?.name}</p>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-foreground/30">{order.orderNumber}</p>
                          </div>
                          <Badge className={cn("border-0 text-[11px]", statusTone[order.status])}>{order.deliveryMethod}</Badge>
                        </div>
                        <OrderItemsList items={orderLineItems} fallbackQuantity={order.quantity} />
                        {notePreview ? (
                          <div className="mt-3 rounded-lg border border-line/70 bg-white/[0.03] px-3 py-2.5">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/28">Note</p>
                            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-foreground/70">{notePreview}</p>
                          </div>
                        ) : null}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <CompactStat label="Qty" value={`${order.quantity}`} suffix="pcs" />
                          <CompactStat label="To Pay" value={`Php ${String(order.totalAmount)}`} />
                        </div>
                        <div className="mt-3 space-y-1.5 text-sm text-foreground/62">
                          <InfoLine icon={MapPin} text={order.location ?? "No area"} />
                          <InfoLine icon={Clock3} text={formatSchedule(order.preferredSchedule)} />
                        </div>
                      </button>
                    );
                  })}
                  {columnOrders.length === 0 ? <div className="h-2" /> : null}
                </div>
              </Card>
            );
          })}
        </div>
        {filteredItems.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center px-6 py-10 text-center text-sm text-foreground/45">
            No orders matched your search.
          </div>
        ) : null}
      </div>

      {detailOpen ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close order details"
            onClick={() => setDetailOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-[480px] p-2 sm:p-4">
            <Card className="flex h-full flex-col overflow-hidden border-line/90 bg-panel p-0 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
              {selectedOrder ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="border-b border-line/75 p-4 sm:p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setDetailOpen(false)}
                        className="inline-flex items-center gap-2 rounded-md border border-line/80 px-3 py-1.5 text-xs text-foreground/55 transition hover:border-accent/35 hover:text-foreground"
                      >
                        <ChevronRight size={14} />
                        Hide details
                      </button>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/30">Selected Order</p>
                        <h3 className="mt-2 truncate text-2xl font-semibold leading-tight sm:text-[32px] sm:leading-none">{selectedOrder.customer?.name}</h3>
                        <p className="mt-2 text-sm text-foreground/40">{selectedOrder.orderNumber}</p>
                      </div>
                      <Badge className={cn("border-0", statusTone[selectedOrder.status])}>{selectedOrder.status.replaceAll("_", " ")}</Badge>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    <div className="space-y-4">
                      <div className="space-y-2 rounded-lg border border-line/75 bg-black/[0.08] p-4">
                        <label className="text-sm font-medium text-foreground/72">Update status</label>
                        <Select value={selectedStatus} onChange={setSelectedStatus} options={statusSelectOptions} />
                        <Button className="w-full" onClick={updateStatus} disabled={pending || deletePending || selectedStatus === selectedOrder.status}>
                          {pending ? "Updating..." : "Save Status"}
                        </Button>
                        {selectedOrder.status !== selectedStatus ? (
                          <p className="flex items-center gap-2 text-xs text-foreground/45">
                            <ArrowRight size={14} />
                            {selectedOrder.status.replaceAll("_", " ")} to {selectedStatus.replaceAll("_", " ")}
                          </p>
                        ) : null}
                        {error ? <p className="text-sm text-danger">{error}</p> : null}
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-medium text-foreground/68">Order details</p>
                        <div className="flex flex-wrap gap-2">
                          {!editMode ? (
                            <Button variant="ghost" className="px-3" onClick={copyOrderDetails}>
                              {copiedDetails ? <Check size={14} /> : <Copy size={14} />}
                              {copiedDetails ? "Copied" : "Copy"}
                            </Button>
                          ) : null}
                          {!editMode ? (
                            <Button variant="ghost" className="px-3" onClick={copyTrackingLink}>
                              {copiedTracking ? <Check size={14} /> : <Link2 size={14} />}
                              {copiedTracking ? "Copied" : "Track Link"}
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            className="px-3 text-danger hover:text-danger"
                            onClick={deleteOrder}
                            disabled={deletePending || pending}
                          >
                            <Trash2 size={14} />
                            {deletePending ? "Deleting..." : "Delete"}
                          </Button>
                          <Button variant="ghost" className="px-3" onClick={() => setEditMode((value) => !value)}>
                            {editMode ? "Cancel Edit" : "Edit Details"}
                          </Button>
                          {editMode ? (
                            <Button className="px-3" onClick={saveDetails} disabled={pending || deletePending}>
                              {pending ? "Saving..." : "Save Details"}
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {editMode ? (
                        <div className="grid gap-3">
                          <Input value={form.customerName} onChange={(e) => setForm((c) => ({ ...c, customerName: e.target.value }))} placeholder="Customer name" />
                          <Input value={form.phoneNumber} onChange={(e) => setForm((c) => ({ ...c, phoneNumber: e.target.value }))} placeholder="Phone number" />
                          <div className="rounded-lg border border-accent/35 bg-accent/[0.06] p-3">
                            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-accent">Maxim Link</p>
                            <Input
                              value={form.maximTrackingLink}
                              onChange={(e) => setForm((c) => ({ ...c, maximTrackingLink: e.target.value }))}
                              placeholder="Paste Maxim tracking link here"
                            />
                          </div>
                          <div className="overflow-hidden rounded-lg border border-line/80 bg-black/10">
                            <div className="flex items-center justify-between gap-3 border-b border-line/75 px-4 py-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Order Items</p>
                                <p className="mt-1 text-xs text-foreground/45">{orderItemSummary.quantity} pcs selected</p>
                              </div>
                              <p className="text-sm font-semibold">Php {formatPeso(orderItemSummary.subtotal)}</p>
                            </div>
                            <div className="divide-y divide-line/65">
                              {lineItems.map((item) => {
                                const quantity = Number(item.quantity || 0);
                                const subtotal = quantity * item.price;
                                return (
                                  <div
                                    key={item.productName}
                                    className={cn(
                                      "grid grid-cols-[minmax(0,1fr)_132px] items-center gap-3 px-4 py-3 transition",
                                      quantity > 0 && "bg-accent/[0.06]"
                                    )}
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold">{item.productName}</p>
                                      <p className="mt-0.5 text-xs text-foreground/45">
                                        Php {item.price}{quantity > 0 ? ` - Php ${formatPeso(subtotal)}` : ""}
                                      </p>
                                    </div>
                                    <div className="grid grid-cols-[34px_minmax(48px,1fr)_34px] items-center gap-2">
                                      <button
                                        type="button"
                                        aria-label={`Decrease ${item.productName}`}
                                        onClick={() => stepLineItem(item.productName, -1)}
                                        className="flex h-8 w-8 items-center justify-center rounded-md border border-line/70 text-foreground/70 transition hover:border-accent/40 hover:text-foreground"
                                      >
                                        <Minus size={14} />
                                      </button>
                                      <Input
                                        aria-label={`${item.productName} quantity`}
                                        className="h-8 px-2 text-center"
                                        type="number"
                                        min="0"
                                        value={item.quantity}
                                        onChange={(e) => updateLineItem(item.productName, e.target.value)}
                                      />
                                      <button
                                        type="button"
                                        aria-label={`Increase ${item.productName}`}
                                        onClick={() => stepLineItem(item.productName, 1)}
                                        className="flex h-8 w-8 items-center justify-center rounded-md border border-line/70 text-foreground/70 transition hover:border-accent/40 hover:text-foreground"
                                      >
                                        <Plus size={14} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <Select value={form.deliveryMethod} onChange={(value) => setForm((c) => ({ ...c, deliveryMethod: value }))} options={deliverySelectOptions} />
                          <Select value={form.paymentMethod} onChange={(value) => setForm((c) => ({ ...c, paymentMethod: value }))} options={paymentSelectOptions} />
                          {shouldShowMaximTrackingFields() ? (
                            <Input type="number" min="0" step="0.01" value={form.deliveryFee} onChange={(e) => setForm((c) => ({ ...c, deliveryFee: e.target.value }))} placeholder="Delivery fee" />
                          ) : null}
                          <Input value={form.location} onChange={(e) => setForm((c) => ({ ...c, location: e.target.value }))} placeholder="Area / location" />
                          <Input value={form.address} onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))} placeholder="Address" />
                          <Input type="datetime-local" value={form.preferredSchedule} onChange={(e) => setForm((c) => ({ ...c, preferredSchedule: e.target.value }))} />
                          <div className="space-y-3 rounded-lg border border-line/75 bg-black/[0.08] p-4">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Maxim Tracking</p>
                              <p className="mt-1 text-xs text-foreground/45">Paste the booking link and rider details after booking Maxim.</p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input
                                value={form.maximRiderName}
                                onChange={(e) => setForm((c) => ({ ...c, maximRiderName: e.target.value }))}
                                placeholder="Rider name"
                              />
                              <Input
                                value={form.maximRiderPlate}
                                onChange={(e) => setForm((c) => ({ ...c, maximRiderPlate: e.target.value }))}
                                placeholder="Plate / rider ID"
                              />
                              <Input
                                type="datetime-local"
                                value={form.maximScheduledAt}
                                onChange={(e) => setForm((c) => ({ ...c, maximScheduledAt: e.target.value }))}
                              />
                              <Input
                                type="datetime-local"
                                value={form.maximEta}
                                onChange={(e) => setForm((c) => ({ ...c, maximEta: e.target.value }))}
                              />
                            </div>
                            <select
                              value={form.maximStatus}
                              onChange={(e) => setForm((c) => ({ ...c, maximStatus: e.target.value }))}
                              className="h-10 w-full rounded-lg border border-line/80 bg-black/10 px-3 text-sm text-foreground outline-none transition hover:border-foreground/18 focus:border-accent/60"
                            >
                              <option value="booked">Booked</option>
                              <option value="completed">Completed</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                            <textarea
                              value={form.maximBookingNotes}
                              onChange={(e) => setForm((c) => ({ ...c, maximBookingNotes: e.target.value }))}
                              placeholder="Maxim booking notes"
                              className="min-h-20 w-full rounded-lg border border-line/80 bg-black/10 px-3.5 py-3 text-sm outline-none transition placeholder:text-foreground/38 hover:border-foreground/18 focus:border-accent/60"
                            />
                          </div>
                          <textarea
                            value={form.notes}
                            onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
                            placeholder="Additional notes"
                            className="min-h-28 w-full rounded-lg border border-line/80 bg-black/10 px-3.5 py-3 text-sm outline-none transition placeholder:text-foreground/38 hover:border-foreground/18 focus:border-accent/60"
                          />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <MiniStat label="Quantity" value={`${orderItemSummary.quantity} pcs`} />
                            <MiniStat label="Total to Pay" value={`Php ${formatPeso(orderItemSummary.total)}`} />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="rounded-lg border border-line/75 bg-black/[0.08] p-4">
                            <DetailBlock label="Customer" value={selectedOrder.customer?.phoneNumber ?? "No phone number"} />
                            <div className="mt-4">
                              <DetailBlock label="Location" value={selectedOrder.address ?? selectedOrder.location ?? "No address provided"} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <MiniStat label="Quantity" value={`${selectedOrder.quantity} pcs`} />
                            <MiniStat label="Total to Pay" value={`Php ${String(selectedOrder.totalAmount)}`} />
                            <MiniStat label="Method" value={selectedOrder.deliveryMethod} />
                            <MiniStat label="Payment" value={formatPaymentMethod(selectedOrder.paymentMethod)} />
                            <MiniStat label="Schedule" value={formatSchedule(selectedOrder.preferredSchedule)} />
                          </div>
                          <div className="rounded-lg border border-line/75 bg-black/[0.08] p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Items Ordered</p>
                            <OrderItemsList items={getOrderLineItems(selectedOrder)} fallbackQuantity={selectedOrder.quantity} className="mt-3" />
                          </div>
                          {isMaximOrderView(selectedOrder) ? (
                            <>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <MiniStat
                                  label="Item Subtotal"
                                  value={`Php ${String(Number(selectedOrder.totalAmount ?? 0) - Number(selectedOrder.deliveryFee ?? 0))}`}
                                />
                                <MiniStat label="Delivery Fee" value={`Php ${String(selectedOrder.deliveryFee ?? 0)}`} />
                              </div>
                              <div className="space-y-3 rounded-lg border border-line/75 bg-black/[0.08] p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Maxim Tracking</p>
                                  {selectedOrder.delivery?.trackingLink ? (
                                    <a
                                      href={selectedOrder.delivery.trackingLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-line bg-white/[0.06] px-3 text-sm font-semibold text-foreground transition hover:bg-white/[0.1]"
                                    >
                                      <ExternalLink size={14} />
                                      Open Maxim
                                    </a>
                                  ) : null}
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <MiniStat label="Status" value={selectedOrder.delivery?.status ?? "Not booked"} />
                                  <MiniStat label="ETA" value={formatSchedule(selectedOrder.delivery?.eta)} />
                                  <MiniStat label="Rider" value={formatRider(selectedOrder)} />
                                  <MiniStat label="Booking Time" value={formatSchedule(selectedOrder.delivery?.scheduledAt)} />
                                </div>
                                {selectedOrder.delivery?.bookingNotes ? (
                                  <p className="whitespace-pre-wrap rounded-lg border border-line/70 bg-black/[0.08] px-3 py-2.5 text-sm leading-6 text-foreground/78">
                                    {selectedOrder.delivery.bookingNotes}
                                  </p>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                          <div className="space-y-3 rounded-lg border border-line/75 bg-black/[0.08] p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Notes</p>
                              {getOrderNotes(selectedOrder).length > 0 ? (
                                <button
                                  type="button"
                                  onClick={copyNotes}
                                  className="inline-flex items-center gap-2 rounded-md border border-line/70 px-3 py-1 text-xs text-foreground/65 transition hover:border-accent/35 hover:text-foreground"
                                >
                                  {copiedNotes ? <Check size={13} /> : <Copy size={13} />}
                                  {copiedNotes ? "Copied" : "Copy"}
                                </button>
                              ) : null}
                            </div>
                            <div className="space-y-2">
                              {getOrderNotes(selectedOrder).length === 0 ? (
                                <p className="rounded-lg border border-dashed border-line/75 px-3 py-3 text-sm text-foreground/45">
                                  No notes yet.
                                </p>
                              ) : null}
                              {getOrderNotes(selectedOrder).map((note) => (
                                <div key={note.id} className="rounded-lg border border-line/70 bg-black/[0.08] px-3 py-2.5">
                                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/82">{note.body}</p>
                                  <p className="mt-2 text-[11px] text-foreground/38">{formatNoteTime(note.createdAt)}</p>
                                </div>
                              ))}
                            </div>
                            <textarea
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="Add a new note..."
                              className="min-h-24 w-full resize-y rounded-lg border border-line/80 bg-black/10 px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-foreground/38 hover:border-foreground/18 focus:border-accent/60"
                            />
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs text-foreground/42">
                                {noteDraft.trim() ? `${noteDraft.trim().length} characters` : "Write a comment-style note"}
                              </p>
                              <Button
                                className="px-3"
                                onClick={addNote}
                                disabled={pending || deletePending || !noteDraft.trim()}
                              >
                                {pending ? "Adding..." : "Add Note"}
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[520px] items-center justify-center p-8 text-center text-sm text-foreground/45">
                  {filteredItems.length === 0
                    ? "No order is selected because the current search returned no results."
                    : "Select an order card to inspect details and update its status."}
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoLine({ icon: Icon, text }: { icon: typeof MapPin; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={13} className="mt-0.5 shrink-0 text-foreground/30" />
      <span className="line-clamp-2">{text}</span>
    </div>
  );
}

function OrderItemsList({
  items,
  fallbackQuantity,
  className
}: {
  items: OrderLineItemView[];
  fallbackQuantity?: number;
  className?: string;
}) {
  const displayItems = items.length > 0 ? items : [{ name: "Empanada", quantity: Number(fallbackQuantity ?? 0) }];

  return (
    <div className={cn("mt-3 space-y-1.5 rounded-lg border border-line/70 bg-white/[0.03] p-2.5", className)}>
      {displayItems.map((item) => (
        <div key={`${item.name}-${item.quantity}-${item.price ?? "price"}`} className="flex items-start justify-between gap-3 text-xs">
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground/82">{item.name}</p>
            <p className="mt-0.5 text-foreground/42">
              {item.quantity} pcs{item.price !== undefined ? ` x Php ${item.price}` : ""}
            </p>
          </div>
          {item.subtotal !== undefined ? (
            <span className="shrink-0 font-semibold text-foreground/78">Php {item.subtotal}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-[0.18em] text-foreground/35">{label}</p>
      <p className="text-sm leading-6 text-foreground/78">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/75 bg-black/[0.08] p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-foreground/30">{label}</p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}

function CompactStat({
  label,
  value,
  suffix
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-line/70 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/28">{label}</p>
      <p className="mt-1 text-sm font-medium">
        {value}
        {suffix ? <span className="ml-1 text-xs text-foreground/45">{suffix}</span> : null}
      </p>
    </div>
  );
}

function toInputDate(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getLocalDateTimeInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getTodayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compareOrdersBySchedule(a: any, b: any) {
  const aSchedule = getTimeValue(a.preferredSchedule);
  const bSchedule = getTimeValue(b.preferredSchedule);

  if (aSchedule !== bSchedule) {
    return aSchedule - bSchedule;
  }

  return getTimeValue(a.createdAt) - getTimeValue(b.createdAt);
}

function getTimeValue(value?: string | null) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function getOrderNotes(order: any): OrderNoteView[] {
  const orderNotes: OrderNoteView[] = Array.isArray(order?.orderNotes) ? order.orderNotes : [];
  if (orderNotes.length > 0) {
    return orderNotes
      .map((note) => ({ ...note, body: stripItemsBlock(note.body) }))
      .filter((note) => note.body.trim());
  }

  const body = stripItemsBlock(order?.notes ?? "");
  return body
    ? [
        {
          id: "legacy-note",
          body,
          createdAt: order.createdAt
        }
      ]
    : [];
}

function getOrderLineItems(order: any): OrderLineItemView[] {
  const storedItems = normalizeStoredOrderItems(order?.items);
  if (storedItems.length > 0) {
    return storedItems;
  }

  const rawNoteBodies: string[] = Array.isArray(order?.orderNotes) ? order.orderNotes.map((note: any) => note.body) : [];
  const body: string = String(order?.notes ?? "") || (rawNoteBodies.find((note) => note.includes("Items:")) ?? "");
  const itemLines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));

  const items = itemLines
    .map((line): OrderLineItemView | null => {
      const match = line.match(/^-\s+(.+?)\s+x\s+(\d+)(?:\s+@\s+Php\s+([\d.]+)\s+=\s+Php\s+([\d.]+))?$/i);
      if (!match) {
        return null;
      }

      return {
        name: match[1],
        quantity: Number(match[2]),
        ...(match[3] ? { price: Number(match[3]) } : {}),
        ...(match[4] ? { subtotal: Number(match[4]) } : {})
      };
    })
    .filter((item): item is OrderLineItemView => Boolean(item));

  if (items.length > 0) {
    return items;
  }

  const productMatch = body.match(/^Product:\s*(.+)$/im);
  return productMatch ? [{ name: productMatch[1].trim(), quantity: Number(order?.quantity ?? 0) }] : [];
}

function normalizeStoredOrderItems(value: unknown): OrderLineItemView[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): OrderLineItemView | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const name = typeof candidate.name === "string" ? candidate.name : "";
      const quantity = Number(candidate.quantity ?? 0);
      if (!name || quantity < 1) {
        return null;
      }

      const price = candidate.price !== undefined ? Number(candidate.price) : undefined;
      const subtotal = candidate.subtotal !== undefined ? Number(candidate.subtotal) : undefined;
      return {
        name,
        quantity,
        ...(price !== undefined && !Number.isNaN(price) ? { price } : {}),
        ...(subtotal !== undefined && !Number.isNaN(subtotal) ? { subtotal } : {})
      };
    })
    .filter((item): item is OrderLineItemView => Boolean(item));
}

function getOrderNotePreview(order: any) {
  return getOrderNotes(order)
    .map((note) => note.body.trim())
    .filter(Boolean)
    .join("\n\n");
}

function createEditableLineItems(order?: any): EditableOrderLineItem[] {
  const parsedItems = order ? getOrderLineItems(order) : [];
  const parsedByName = new Map(parsedItems.map((item) => [item.name.toLowerCase(), item]));
  const knownItems = productOptions.map((product) => {
    const existing = parsedByName.get(product.value.toLowerCase());
    return {
      productName: product.value,
      quantity: existing?.quantity ? String(existing.quantity) : "",
      price: existing?.price ?? product.price
    };
  });
  const knownNames = new Set(productOptions.map((product) => product.value.toLowerCase()));
  const customItems = parsedItems
    .filter((item) => !knownNames.has(item.name.toLowerCase()))
    .map((item) => ({
      productName: item.name,
      quantity: item.quantity ? String(item.quantity) : "",
      price: item.price ?? Number(order?.unitPrice ?? 0)
    }));

  if (parsedItems.length > 0) {
    return [...knownItems, ...customItems];
  }

  const fallbackQuantity = Number(order?.quantity ?? 0);
  return knownItems.map((item, index) => ({
    ...item,
    quantity: index === 0 && fallbackQuantity > 0 ? String(fallbackQuantity) : item.quantity
  }));
}

function stripItemsBlock(value: string) {
  const lines = value.split(/\r?\n/);
  const result: string[] = [];
  let index = 0;

  while (index < lines.length) {
    if (lines[index].trim().toLowerCase() === "items:") {
      index += 1;
      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        index += 1;
      }
      while (index < lines.length && lines[index].trim() === "") {
        index += 1;
      }
      continue;
    }

    result.push(lines[index]);
    index += 1;
  }

  return result.join("\n").trim();
}

function formatOrderDetailsForCopy(order: any) {
  const lineItems = getOrderLineItems(order);
  const displayItems = lineItems.length > 0 ? lineItems : [{ name: "Empanada", quantity: Number(order?.quantity ?? 0) }];
  const itemLines = displayItems.map((item) => {
    const amount = item.subtotal !== undefined ? ` - Php ${item.subtotal}` : "";
    const price = item.price !== undefined ? ` x Php ${item.price}` : "";
    return `${item.name}: ${item.quantity} pcs${price}${amount}`;
  });
  const address = order?.address ?? order?.location ?? "No address provided";

  return [
    `Order: ${order?.orderNumber ?? ""}`,
    `Customer: ${order?.customer?.name ?? ""}`,
    `Phone: ${order?.customer?.phoneNumber ?? "No phone number"}`,
    `Address: ${address}`,
    `Schedule: ${formatSchedule(order?.preferredSchedule)}`,
    `Delivery: ${order?.deliveryMethod ?? ""}`,
    `Payment: ${formatPaymentMethod(order?.paymentMethod)}`,
    "Items:",
    ...itemLines.map((line) => `- ${line}`),
    `Quantity: ${order?.quantity ?? 0} pcs`,
    `Total to pay: Php ${String(order?.totalAmount ?? 0)}`
  ].join("\n");
}

function formatNoteTime(value?: string | null) {
  return value ? noteTimeFormatter.format(new Date(value)) : "Just now";
}

function formatPaymentMethod(value?: string | null) {
  if (value === "gcash") {
    return "GCash";
  }
  return "COD";
}

function formatSchedule(value?: string | null) {
  return value ? scheduleFormatter.format(new Date(value)) : "Not scheduled";
}

function formatRider(order: any) {
  return [order?.delivery?.riderName, order?.delivery?.riderPlate].filter(Boolean).join(" - ") || "No rider details";
}

function isMaximOrderView(order: any) {
  return (
    order?.deliveryMethod === "maxim" ||
    Boolean(order?.delivery) ||
    order?.status === "ready_for_booking" ||
    order?.status === "booked"
  );
}

function formatPeso(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatExportDate(value?: string | null) {
  return value ? scheduleFormatter.format(new Date(value)) : "";
}

function createXlsxBlob(sheetName: string, rows: Array<Array<unknown>>) {
  const files = new Map<string, string>([
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    ],
    [
      "xl/styles.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`
    ],
    ["xl/worksheets/sheet1.xml", createWorksheetXml(rows)]
  ]);

  return new Blob([createZip(files)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

function createWorksheetXml(rows: Array<Array<unknown>>) {
  const body = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((value, columnIndex) => {
          const reference = `${columnName(columnIndex)}${rowNumber}`;
          return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(String(value ?? ""))}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${body}</sheetData>
</worksheet>`;
}

function createZip(files: Map<string, string>) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const contentBytes = encoder.encode(content);
    const crc = crc32(contentBytes);
    const localHeader = createZipHeader(0x04034b50, nameBytes, contentBytes, crc, offset);
    const centralHeader = createZipHeader(0x02014b50, nameBytes, contentBytes, crc, offset);
    localParts.push(localHeader, contentBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + contentBytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.size, true);
  view.setUint16(10, files.size, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, offset, true);
  const parts = [...localParts, ...centralParts, end];
  const zipBytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    zipBytes.set(part, cursor);
    cursor += part.length;
  }
  return zipBytes.buffer.slice(0);
}

function createZipHeader(signature: number, nameBytes: Uint8Array, contentBytes: Uint8Array, crc: number, localOffset: number) {
  const isCentral = signature === 0x02014b50;
  const header = new Uint8Array(isCentral ? 46 + nameBytes.length : 30 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, signature, true);
  if (isCentral) {
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, contentBytes.length, true);
    view.setUint32(24, contentBytes.length, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint32(42, localOffset, true);
    header.set(nameBytes, 46);
  } else {
    view.setUint16(4, 20, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, contentBytes.length, true);
    view.setUint32(22, contentBytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
  }
  return header;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function columnName(index: number) {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
