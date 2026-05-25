"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

const productOptions = [
  { label: "Pork Regular - Php 20", value: "Pork Regular", price: 20 },
  { label: "Pork with Egg - Php 25", value: "Pork with Egg", price: 25 },
  { label: "Ham & Cheese - Php 25", value: "Ham & Cheese", price: 25 },
  { label: "Chicken - Php 20", value: "Chicken", price: 20 },
  { label: "Ube with Cheese - Php 25", value: "Ube with Cheese", price: 25 }
];

export function ManualOrderForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ManualOrderFormState>(createInitialFormState);
  const [lineItems, setLineItems] = useState<OrderLineItem[]>(createInitialLineItems);
  const [customers, setCustomers] = useState<CustomerSuggestion[]>([]);
  const [customersLoaded, setCustomersLoaded] = useState(false);

  useEffect(() => {
    setForm((current) => (current.preferredSchedule ? current : { ...current, preferredSchedule: getLocalDateTimeInputValue() }));
  }, []);

  useEffect(() => {
    if (!open || customersLoaded) {
      return;
    }

    let active = true;
    void apiFetch<CustomerSuggestion[]>("/customers")
      .then((result) => {
        if (!active) {
          return;
        }
        setCustomers(result);
        setCustomersLoaded(true);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setCustomersLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [customersLoaded, open]);

  const deliveryOptions = [
    { label: "Pickup", value: "pickup" },
    { label: "Maxim", value: "maxim" }
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

  function update(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const orderSummary = useMemo(() => {
    const items = lineItems
      .map((item) => {
        const product = productOptions.find((option) => option.value === item.productName);
        const quantity = Number(item.quantity || 0);
        return product && quantity > 0
          ? {
              name: product.value,
              quantity,
              price: product.price,
              subtotal: quantity * product.price
            }
          : null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const itemSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const deliveryFee = form.deliveryMethod === "maxim" ? Number(form.deliveryFee || 0) : 0;

    return {
      items,
      quantity,
      itemSubtotal,
      deliveryFee,
      total: itemSubtotal + deliveryFee,
      unitPrice: quantity > 0 ? itemSubtotal / quantity : 0
    };
  }, [form.deliveryFee, form.deliveryMethod, lineItems]);

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

  const customerSuggestions = useMemo(() => {
    const query = form.customerName.trim().toLowerCase();
    if (query.length < 2) {
      return [];
    }

    return customers
      .filter((customer) => customer.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(query);
        const bStarts = b.name.toLowerCase().startsWith(query);
        if (aStarts !== bStarts) {
          return aStarts ? -1 : 1;
        }
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
      deliveryMethod:
        customer.preferredDeliveryMethod === "pickup" || customer.preferredDeliveryMethod === "maxim"
          ? customer.preferredDeliveryMethod
          : current.deliveryMethod,
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

        const itemsNote = [
          "Items:",
          ...orderSummary.items.map(
            (item) => `- ${item.name} x ${item.quantity} @ Php ${item.price} = Php ${item.subtotal}`
          )
        ].join("\n");
        const notes = [itemsNote, form.notes.trim()].filter(Boolean).join("\n\n");

        await apiFetch("/orders/manual", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            quantity: orderSummary.quantity,
            unitPrice: orderSummary.unitPrice,
            deliveryFee: orderSummary.deliveryFee,
            preferredSchedule: form.preferredSchedule || undefined,
            paymentMethod: form.paymentMethod,
            phoneNumber: form.phoneNumber || undefined,
            location: form.location || undefined,
            address: form.address || undefined,
            notes: notes || undefined
          })
        });
        setForm(createInitialFormState({ preferredSchedule: getLocalDateTimeInputValue() }));
        setLineItems(createInitialLineItems());
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to create order");
      }
    });
  }

  return (
    <Card className="border-line/80 bg-panel/80 p-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        suppressHydrationWarning
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-white/[0.04] sm:px-5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/12 text-accent">
            <Plus size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">New Order</h2>
            <p className="truncate text-xs text-foreground/50">Create a manual order only when needed.</p>
          </div>
        </div>
        <ChevronDown size={16} className={cn("shrink-0 text-foreground/45 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="border-t border-line/80 bg-black/[0.04] px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
          <form id="manual-order-form" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
            <div className="relative">
              <Input placeholder="Customer name" value={form.customerName} onChange={(e) => update("customerName", e.target.value)} required />
              {customerSuggestions.length > 0 ? (
                <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-lg border border-line/90 bg-panel p-1.5 shadow-2xl shadow-black/35">
                  <div className="space-y-1">
                    {customerSuggestions.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => applyCustomerSuggestion(customer)}
                        className="flex w-full flex-col items-start rounded-md px-3 py-2.5 text-left transition hover:bg-white/[0.07]"
                      >
                        <span className="text-sm font-medium text-foreground">{customer.name}</span>
                        <span className="text-xs text-foreground/50">
                          {[customer.phoneNumber, customer.defaultAddress].filter(Boolean).join(" • ") || "Use saved customer info"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <Input placeholder="Phone number" value={form.phoneNumber} onChange={(e) => update("phoneNumber", e.target.value)} />
            <div className="rounded-lg border border-line/80 bg-black/10 p-3 xl:col-span-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Items</p>
                <p className="text-sm font-semibold text-foreground">Php {formatPeso(orderSummary.itemSubtotal)}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {lineItems.map((item) => {
                  const product = productOptions.find((option) => option.value === item.productName);
                  return (
                    <div key={item.productName} className="flex items-center gap-2 rounded-lg border border-line/70 bg-white/[0.03] p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{product?.value}</p>
                        <p className="text-xs text-foreground/45">Php {product?.price ?? 0}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Decrease ${item.productName}`}
                        onClick={() => stepLineItem(item.productName, -1)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line/70 text-foreground/70 transition hover:border-accent/40 hover:text-foreground"
                      >
                        <Minus size={14} />
                      </button>
                      <Input
                        aria-label={`${item.productName} quantity`}
                        className="h-8 w-16 px-2 text-center"
                        type="number"
                        min="0"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(item.productName, e.target.value)}
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${item.productName}`}
                        onClick={() => stepLineItem(item.productName, 1)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line/70 text-foreground/70 transition hover:border-accent/40 hover:text-foreground"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <Select value={form.deliveryMethod} onChange={(value) => update("deliveryMethod", value)} options={deliveryOptions} />
            <Select value={form.paymentMethod} onChange={(value) => update("paymentMethod", value)} options={paymentOptions} />
            {form.deliveryMethod === "maxim" ? (
              <Input placeholder="Delivery fee" type="number" min="0" step="0.01" value={form.deliveryFee} onChange={(e) => update("deliveryFee", e.target.value)} />
            ) : null}
            <Input placeholder="Area / location" value={form.location} onChange={(e) => update("location", e.target.value)} />
            <Input placeholder="Full address" value={form.address} onChange={(e) => update("address", e.target.value)} />
            <Input type="datetime-local" value={form.preferredSchedule} onChange={(e) => update("preferredSchedule", e.target.value)} />
            <Select value={form.status} onChange={(value) => update("status", value)} options={statusOptions} />
            <Input className="xl:col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} />
            <div className="flex flex-col gap-2 rounded-lg border border-line/75 bg-black/[0.08] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between xl:col-span-4">
              <span className="text-foreground/55">{orderSummary.quantity} pcs selected</span>
              <span className="font-semibold">Total to pay: Php {formatPeso(orderSummary.total)}</span>
            </div>
            <div className="flex justify-end xl:col-span-4">
              <Button type="submit" form="manual-order-form" disabled={pending} className="w-full sm:w-auto">
                {pending ? "Saving..." : "Add Order"}
              </Button>
            </div>
          </form>
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        </div>
      ) : null}
    </Card>
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

function createInitialLineItems(): OrderLineItem[] {
  return productOptions.map((product, index) => ({
    productName: product.value,
    quantity: index === 0 ? "20" : ""
  }));
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
