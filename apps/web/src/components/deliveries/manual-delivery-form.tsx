"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export function ManualDeliveryForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    customerName: "",
    phoneNumber: "",
    address: "",
    areaGroup: "",
    quantity: "20",
    totalAmount: "360",
    deliveryFee: "0",
    preferredSchedule: getLocalDateTimeInputValue(),
    notes: ""
  });

  function update(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await apiFetch("/deliveries/manual", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            quantity: Number(form.quantity),
            totalAmount: Number(form.totalAmount),
            deliveryFee: Number(form.deliveryFee),
            preferredSchedule: form.preferredSchedule || undefined,
            phoneNumber: form.phoneNumber || undefined,
            areaGroup: form.areaGroup || undefined,
            notes: form.notes || undefined
          })
        });
        setForm({
          customerName: "",
          phoneNumber: "",
          address: "",
          areaGroup: "",
          quantity: "20",
          totalAmount: "360",
          deliveryFee: "0",
          preferredSchedule: getLocalDateTimeInputValue(),
          notes: ""
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to create delivery");
      }
    });
  }

  return (
    <Card>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Manual Delivery Entry</h2>
          <p className="text-sm text-foreground/55">Add delivery jobs directly to the Maxim booking queue.</p>
        </div>
        <Button type="submit" form="manual-delivery-form" disabled={pending}>
          {pending ? "Saving..." : "Add Delivery"}
        </Button>
      </div>
      <form id="manual-delivery-form" className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" onSubmit={submit}>
        <Input placeholder="Customer name" value={form.customerName} onChange={(e) => update("customerName", e.target.value)} required />
        <Input placeholder="Phone number" value={form.phoneNumber} onChange={(e) => update("phoneNumber", e.target.value)} />
        <Input placeholder="Address" value={form.address} onChange={(e) => update("address", e.target.value)} required />
        <Input placeholder="Area group" value={form.areaGroup} onChange={(e) => update("areaGroup", e.target.value)} />
        <Input placeholder="Quantity" type="number" min="1" value={form.quantity} onChange={(e) => update("quantity", e.target.value)} required />
        <Input placeholder="Total amount" type="number" min="0" step="0.01" value={form.totalAmount} onChange={(e) => update("totalAmount", e.target.value)} required />
        <Input placeholder="Delivery fee" type="number" min="0" step="0.01" value={form.deliveryFee} onChange={(e) => update("deliveryFee", e.target.value)} />
        <Input type="datetime-local" value={form.preferredSchedule} onChange={(e) => update("preferredSchedule", e.target.value)} />
        <Input placeholder="Notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} className="xl:col-span-2" />
      </form>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </Card>
  );
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
