"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, Plus } from "lucide-react";
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
  quantity: string;
  unitPrice: string;
  deliveryFee: string;
  deliveryMethod: string;
  paymentMethod: string;
  location: string;
  address: string;
  preferredSchedule: string;
  status: string;
  notes: string;
};

type CustomerSuggestion = {
  id: string;
  name: string;
  phoneNumber?: string | null;
  defaultAddress?: string | null;
  preferredDeliveryMethod?: string | null;
  notes?: string | null;
};

export function ManualOrderForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ManualOrderFormState>(createInitialFormState);
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
        await apiFetch("/orders/manual", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            quantity: Number(form.quantity),
            unitPrice: Number(form.unitPrice),
            deliveryFee: form.deliveryMethod === "maxim" ? Number(form.deliveryFee || 0) : 0,
            preferredSchedule: form.preferredSchedule || undefined,
            paymentMethod: form.paymentMethod,
            phoneNumber: form.phoneNumber || undefined,
            location: form.location || undefined,
            address: form.address || undefined,
            notes: form.notes || undefined
          })
        });
        setForm(createInitialFormState({ preferredSchedule: getLocalDateTimeInputValue() }));
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
            <Input placeholder="Quantity" type="number" min="1" value={form.quantity} onChange={(e) => update("quantity", e.target.value)} required />
            <Input placeholder="Unit price" type="number" min="0" step="0.01" value={form.unitPrice} onChange={(e) => update("unitPrice", e.target.value)} required />
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
    quantity: "20",
    unitPrice: "15",
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

function getLocalDateTimeInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
