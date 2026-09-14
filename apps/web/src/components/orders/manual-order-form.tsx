"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

type ManualOrderFormState = {
  customerName: string;
  phoneNumber: string;
  deliveryFee: string;
  deliveryMethod: string;
  paymentMethod: string;
  location: string;
  address: string;
  preferredSchedule: string;
  status: string;
  notes: string;
};

type OrderLineItem = {
  productName: string;
  quantity: string;
};

type CustomerSuggestion = {
  id: string;
  name: string;
  phoneNumber?: string | null;
  defaultAddress?: string | null;
  preferredDeliveryMethod?: string | null;
  notes?: string | null;
};

type ProductCatalogItem = {
  name: string;
  price: number;
  available: boolean;
  sortOrder?: number;
};

type ProductOption = {
  label: string;
  value: string;
  price: number;
  available: boolean;
};

type ManualOrderFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ManualOrderForm({ open, onOpenChange }: ManualOrderFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ManualOrderFormState>(createInitialFormState);
  const [lineItems, setLineItems] = useState<OrderLineItem[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<ProductCatalogItem[]>([]);
  const [customers, setCustomers] = useState<CustomerSuggestion[]>([]);
  const [customersLoaded, setCustomersLoaded] = useState(false);
  const [ownDeliveryQuote, setOwnDeliveryQuote] = useState<{ distanceKm: number | null; estimatedFare: number } | null>(null);
  const [quoting, setQuoting] = useState(false);

  const productOptions = useMemo<ProductOption[]>(() =>
    catalogProducts
      .slice()
      .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || a.name.localeCompare(b.name))
      .map((product) => ({
        label: `${product.name} - Php ${Number(product.price)}${product.available ? "" : " — SOLD OUT"}`,
        value: product.name,
        price: Number(product.price),
        available: product.available !== false
      })),
    [catalogProducts]
  );

  useEffect(() => {
    setForm((current) => (current.preferredSchedule ? current : { ...current, preferredSchedule: getLocalDateTimeInputValue() }));
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void apiFetch<ProductCatalogItem[]>("/products")
      .then((result) => {
        if (!active) return;
        const products = Array.isArray(result) ? result : [];
        setCatalogProducts(products);
        const sortedProducts = products
          .slice()
          .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || a.name.localeCompare(b.name));
        setLineItems(sortedProducts.map((product, index) => ({ productName: product.name, quantity: index === 0 ? "20" : "" })));
      })
      .catch(() => {
        if (active) setCatalogProducts([]);
      });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open || customersLoaded) return;

    let active = true;
    void apiFetch<CustomerSuggestion[]>("/customers")
      .then((result) => {
        if (!active) return;
        setCustomers(result);
        setCustomersLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setCustomersLoaded(true);
      });

    return () => { active = false; };
  }, [customersLoaded, open]);

  useEffect(() => {
    if (!form.address.trim()) {
      setOwnDeliveryQuote(null);
      return;
    }

    let cancelled = false;
    setQuoting(true);
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ pickupAddress: "Empanada Hauz", dropoffAddress: form.address });
      apiFetch<{ distanceKm: number | null; estimatedFare: number }>(`/delivery-network/quote?${params.toString()}`)
        .then((quote) => { if (!cancelled) setOwnDeliveryQuote(quote); })
        .catch(() => { if (!cancelled) setOwnDeliveryQuote(null); })
        .finally(() => { if (!cancelled) setQuoting(false); });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      setQuoting(false);
    };
  }, [form.deliveryMethod, form.address]);

  const deliveryOptions = [
    { label: "Pickup", value: "pickup" },
    { label: "Maxim", value: "maxim" },
    { label: "Own Rider", value: "own_delivery" }
  ];
  const paymentOptions = [
    { label: "COD", value: "cod" },
    { label: "GCash", value: "gcash" }
  ];
  const statusOptions = [
    { label: "Inquiry", value: "inquiry" },
    { label: "Awaiting confirmation", value: "awaiting_confirmation" },
    { label: "Confirmed", value: "confirmed" },
    { label: "Queued", value: "queued" },
    { label: "Ready for pickup", value: "ready_for_pickup" },
    { label: "Ready for booking", value: "ready_for_booking" }
  ];

  function update(key: keyof ManualOrderFormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const orderSummary = useMemo(() => {
    const items = lineItems
      .map((item) => {
        const product = productOptions.find((option) => option.value === item.productName);
        const quantity = Number(item.quantity || 0);
        return product && quantity > 0 ? { name: product.value, quantity, price: product.price, subtotal: quantity * product.price } : null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const itemSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const deliveryFee = form.deliveryMethod === "maxim"
      ? Number(form.deliveryFee || 0)
      : form.deliveryMethod === "own_delivery" ? ownDeliveryQuote?.estimatedFare ?? 0 : 0;

    return { items, quantity, itemSubtotal, deliveryFee, total: itemSubtotal + deliveryFee, unitPrice: quantity > 0 ? itemSubtotal / quantity : 0 };
  }, [form.deliveryFee, form.deliveryMethod, lineItems, ownDeliveryQuote, productOptions]);

  function updateLineItem(productName: string, quantity: string) {
    const normalized = quantity === "" ? "" : String(Math.max(0, Number(quantity)));
    setLineItems((current) => current.map((item) => item.productName === productName ? { ...item, quantity: normalized } : item));
  }

  function stepLineItem(productName: string, delta: number) {
    setLineItems((current) => current.map((item) => {
      if (item.productName !== productName) return item;
      const nextQuantity = Math.max(0, Number(item.quantity || 0) + delta);
      return { ...item, quantity: nextQuantity > 0 ? String(nextQuantity) : "" };
    }));
  }

  function clearLineItems() {
    setLineItems((current) => current.map((item) => ({ ...item, quantity: "" })));
  }

  const customerSuggestions = useMemo(() => {
    const query = form.customerName.trim().toLowerCase();
    if (query.length < 2) return [];
    return customers
      .filter((customer) => customer.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(query);
        const bStarts = b.name.toLowerCase().startsWith(query);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 5);
  }, [customers, form.customerName]);

  function applyCustomerSuggestion(customer: CustomerSuggestion) {
    setForm((current) => ({
      ...current,
      customerName: customer.name,
      phoneNumber: customer.phoneNumber ?? current.phoneNumber,
      address: customer.defaultAddress ?? current.address,
      deliveryMethod: customer.preferredDeliveryMethod === "pickup" || customer.preferredDeliveryMethod === "maxim" || customer.preferredDeliveryMethod === "own_delivery"
        ? customer.preferredDeliveryMethod : current.deliveryMethod,
      notes: customer.notes ?? current.notes
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        if (orderSummary.quantity < 1) {
          setError("Add at least one item quantity before saving.");
          return;
        }

        await apiFetch("/orders/manual", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            quantity: orderSummary.quantity,
            unitPrice: orderSummary.unitPrice,
            deliveryFee: orderSummary.deliveryFee,
            items: orderSummary.items,
            preferredSchedule: form.preferredSchedule || undefined,
            paymentMethod: form.paymentMethod,
            phoneNumber: form.phoneNumber || undefined,
            location: form.location || undefined,
            address: form.address || undefined,
            notes: form.notes.trim() || undefined
          })
        });
        setForm(createInitialFormState({ preferredSchedule: getLocalDateTimeInputValue() }));
        setLineItems(productOptions.map((product, index) => ({ productName: product.value, quantity: index === 0 ? "20" : "" })));
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to create order");
      }
    });
  }

  if (!open) return null;

  return (
    <div className="border border-line/80 bg-panel/80 px-4 pb-5 pt-4 sm:px-6 sm:pb-6 rounded-xl">
      <form id="manual-order-form" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]" onSubmit={submit}>
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="relative">
              <Input placeholder="Customer name" value={form.customerName} onChange={(e) => update("customerName", e.target.value)} required />
              {customerSuggestions.length > 0 ? (
                <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-lg border border-line/90 bg-panel p-1.5 shadow-2xl shadow-black/35">
                  <div className="space-y-1">
                    {customerSuggestions.map((customer) => (
                      <button key={customer.id} type="button" onClick={() => applyCustomerSuggestion(customer)} className="flex w-full flex-col items-start rounded-md px-3 py-2.5 text-left transition hover:bg-white/[0.07]">
                        <span className="text-sm font-medium text-foreground">{customer.name}</span>
                        <span className="text-xs text-foreground/50">{[customer.phoneNumber, customer.defaultAddress].filter(Boolean).join(" - ") || "Use saved customer info"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <Input placeholder="Phone number" value={form.phoneNumber} onChange={(e) => update("phoneNumber", e.target.value)} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Select value={form.deliveryMethod} onChange={(value) => update("deliveryMethod", value)} options={deliveryOptions} />
            <Select value={form.paymentMethod} onChange={(value) => update("paymentMethod", value)} options={paymentOptions} />
            {form.deliveryMethod === "maxim" ? <Input placeholder="Delivery fee" type="number" min="0" step="0.01" value={form.deliveryFee} onChange={(e) => update("deliveryFee", e.target.value)} /> : null}
            {form.address.trim() ? (
              <div className="flex h-10 items-center justify-between rounded-lg border border-line/70 bg-black/10 px-3 text-sm md:col-span-2">
                <span className="text-foreground/50">{quoting ? "Calculating own-rider fee..." : "Own-rider fee estimate"}{!quoting && ownDeliveryQuote?.distanceKm != null ? ` (${ownDeliveryQuote.distanceKm.toFixed(1)} km)` : ""}{form.deliveryMethod !== "own_delivery" ? " - for reference" : ""}</span>
                <span className="font-semibold">{quoting ? "…" : ownDeliveryQuote ? `Php ${formatPeso(ownDeliveryQuote.estimatedFare)}` : "—"}</span>
              </div>
            ) : null}
            <Input placeholder="Area / location" value={form.location} onChange={(e) => update("location", e.target.value)} />
            <Input placeholder="Full address" value={form.address} onChange={(e) => update("address", e.target.value)} />
            <Input type="datetime-local" value={form.preferredSchedule} onChange={(e) => update("preferredSchedule", e.target.value)} />
            <Select value={form.status} onChange={(value) => update("status", value)} options={statusOptions} />
            <Input className="md:col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} />
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-line/80 bg-black/10">
          <div className="flex items-center justify-between gap-3 border-b border-line/75 px-4 py-3">
            <div><p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Order Items</p><p className="mt-1 text-xs text-foreground/45">{orderSummary.quantity} pcs selected</p></div>
            <button type="button" onClick={clearLineItems} className="rounded-md border border-line/70 px-3 py-1.5 text-xs text-foreground/62 transition hover:border-accent/40 hover:text-foreground">Clear</button>
          </div>
          <div className="divide-y divide-line/65">
            {lineItems.map((item) => {
              const product = productOptions.find((option) => option.value === item.productName);
              const quantity = Number(item.quantity || 0);
              const subtotal = quantity * (product?.price ?? 0);
              return (
                <div key={item.productName} className={cn("grid grid-cols-[minmax(0,1fr)_132px] items-center gap-3 px-4 py-3 transition", quantity > 0 && "bg-accent/[0.06]")}>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{product?.value}{product && !product.available ? " — SOLD OUT" : ""}</p><p className="mt-0.5 text-xs text-foreground/45">Php {product?.price ?? 0}{quantity > 0 ? ` - Php ${formatPeso(subtotal)}` : ""}</p></div>
                  <div className="grid grid-cols-[34px_minmax(48px,1fr)_34px] items-center gap-2">
                    <button type="button" disabled={!product?.available} aria-label={`Decrease ${item.productName}`} onClick={() => stepLineItem(item.productName, -1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-line/70 text-foreground/70 transition hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"><Minus size={14} /></button>
                    <Input disabled={!product?.available} aria-label={`${item.productName} quantity`} className="h-8 px-2 text-center" type="number" min="0" value={item.quantity} onChange={(e) => updateLineItem(item.productName, e.target.value)} />
                    <button type="button" disabled={!product?.available} aria-label={`Increase ${item.productName}`} onClick={() => stepLineItem(item.productName, 1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-line/70 text-foreground/70 transition hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"><Plus size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="space-y-2 border-t border-line/75 px-4 py-3">
            <div className="flex items-center justify-between text-sm text-foreground/58"><span>Items subtotal</span><span>Php {formatPeso(orderSummary.itemSubtotal)}</span></div>
            {orderSummary.deliveryFee > 0 ? <div className="flex items-center justify-between text-sm text-foreground/58"><span>Delivery fee</span><span>Php {formatPeso(orderSummary.deliveryFee)}</span></div> : null}
            <div className="flex items-center justify-between border-t border-line/70 pt-2"><span className="text-sm font-medium text-foreground/75">Total to pay</span><span className="text-xl font-semibold">Php {formatPeso(orderSummary.total)}</span></div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-line/75 pt-4 sm:flex-row sm:items-center sm:justify-between xl:col-span-2">
          <p className="text-sm text-foreground/50">{orderSummary.quantity > 0 ? `${orderSummary.quantity} pcs ready to add` : "Add item quantities to continue"}</p>
          <Button type="submit" form="manual-order-form" disabled={pending || orderSummary.quantity < 1} className="w-full sm:w-auto">{pending ? "Saving..." : "Add Order"}</Button>
        </div>
      </form>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

function createInitialFormState(overrides?: Partial<ManualOrderFormState>): ManualOrderFormState {
  return {
    customerName: "",
    phoneNumber: "",
    deliveryFee: "0",
    deliveryMethod: "pickup",
    paymentMethod: "cod",
    location: "",
    address: "",
    preferredSchedule: "",
    status: "queued",
    notes: "",
    ...overrides
  };
}

function formatPeso(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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
