"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Save } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";

export function DeliveryTable({ items }: { items: Array<any> }) {
  const [rows, setRows] = useState(items);
  const [forms, setForms] = useState<Record<string, DeliveryTrackingForm>>(() => createForms(items));
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setRows(items);
    setForms(createForms(items));
  }, [items]);

  async function copyPayload(id: string, payload: string) {
    try {
      await navigator.clipboard.writeText(payload);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1600);
    } catch {
      setCopiedId(null);
    }
  }

  function updateForm(id: string, key: keyof DeliveryTrackingForm, value: string) {
    setForms((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [key]: value
      }
    }));
  }

  function saveTracking(item: any) {
    const form = forms[item.id];
    if (!form) {
      return;
    }

    setError(null);
    setSavedId(null);
    startTransition(async () => {
      try {
        const updated = await apiFetch<any>(`/deliveries/orders/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: form.status,
            scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
            eta: form.eta ? new Date(form.eta).toISOString() : undefined,
            trackingLink: form.trackingLink || undefined,
            riderName: form.riderName || undefined,
            riderPlate: form.riderPlate || undefined,
            bookingNotes: form.bookingNotes || undefined
          })
        });

        setRows((current) =>
          current.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  deliveryStatus: updated.delivery?.status,
                  scheduledAt: updated.delivery?.scheduledAt,
                  eta: updated.delivery?.eta,
                  trackingLink: updated.delivery?.trackingLink,
                  riderName: updated.delivery?.riderName,
                  riderPlate: updated.delivery?.riderPlate,
                  bookingNotes: updated.delivery?.bookingNotes
                }
              : row
          )
        );
        setSavedId(item.id);
        window.setTimeout(() => setSavedId((current) => (current === item.id ? null : current)), 1600);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to save Maxim tracking");
      }
    });
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Manual Booking Queue</h3>
        <p className="text-sm text-foreground/55">Maxim queue only</p>
      </div>
      {error ? <p className="mb-3 rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <Table className="min-w-[1120px]">
        <thead>
          <tr>
            <Th>Customer</Th>
            <Th>Phone</Th>
            <Th>Address</Th>
            <Th>Qty</Th>
            <Th>Total</Th>
            <Th>Schedule</Th>
            <Th>Copy Payload</Th>
            <Th>Maxim Tracking</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const form = forms[item.id] ?? createForm(item);
            return (
              <tr key={item.id}>
                <Td>{item.customerName}</Td>
                <Td>{item.phoneNumber ?? "N/A"}</Td>
                <Td>{item.address ?? "N/A"}</Td>
                <Td>{item.quantity}</Td>
                <Td>{String(item.totalAmount)}</Td>
                <Td>{item.preferredSchedule ? new Date(item.preferredSchedule).toLocaleString() : "Not scheduled"}</Td>
                <Td className="min-w-[320px]">
                  <div className="flex items-center gap-3">
                    <Button
                      variant={copiedId === item.id ? "secondary" : "default"}
                      className="shrink-0"
                      onClick={() => copyPayload(item.id, item.copyDetails)}
                    >
                      {copiedId === item.id ? <Check size={16} /> : <Copy size={16} />}
                      <span className="ml-2">{copiedId === item.id ? "Copied" : "Copy"}</span>
                    </Button>
                    <span className="max-w-[220px] truncate text-xs text-foreground/55">{item.copyDetails}</span>
                  </div>
                </Td>
                <Td className="min-w-[460px]">
                  <div className="grid gap-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        placeholder="Maxim tracking link"
                        value={form.trackingLink}
                        onChange={(event) => updateForm(item.id, "trackingLink", event.target.value)}
                      />
                      <Input
                        placeholder="Rider name"
                        value={form.riderName}
                        onChange={(event) => updateForm(item.id, "riderName", event.target.value)}
                      />
                      <Input
                        placeholder="Plate / rider ID"
                        value={form.riderPlate}
                        onChange={(event) => updateForm(item.id, "riderPlate", event.target.value)}
                      />
                      <Input
                        type="datetime-local"
                        value={form.eta}
                        onChange={(event) => updateForm(item.id, "eta", event.target.value)}
                      />
                    </div>
                    <textarea
                      value={form.bookingNotes}
                      onChange={(event) => updateForm(item.id, "bookingNotes", event.target.value)}
                      placeholder="Booking notes"
                      className="min-h-16 w-full resize-y rounded-lg border border-line/80 bg-black/10 px-3.5 py-2.5 text-sm leading-6 text-foreground outline-none transition placeholder:text-foreground/38 hover:border-foreground/18 focus:border-accent/60"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={form.status}
                        onChange={(event) => updateForm(item.id, "status", event.target.value)}
                        className="h-10 rounded-lg border border-line/80 bg-black/10 px-3 text-sm text-foreground outline-none transition hover:border-foreground/18 focus:border-accent/60"
                      >
                        <option value="booked">Booked</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <Button type="button" onClick={() => saveTracking(item)} disabled={pending}>
                        {savedId === item.id ? <Check size={16} /> : <Save size={16} />}
                        {savedId === item.id ? "Saved" : "Save Tracking"}
                      </Button>
                      {form.trackingLink ? (
                        <a
                          href={form.trackingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white/[0.06] px-3 text-sm font-semibold text-foreground transition hover:bg-white/[0.1]"
                        >
                          <ExternalLink size={16} />
                          Open
                        </a>
                      ) : null}
                    </div>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

type DeliveryTrackingForm = {
  status: string;
  scheduledAt: string;
  eta: string;
  trackingLink: string;
  riderName: string;
  riderPlate: string;
  bookingNotes: string;
};

function createForms(items: Array<any>) {
  return Object.fromEntries(items.map((item) => [item.id, createForm(item)]));
}

function createForm(item: any): DeliveryTrackingForm {
  const status = ["booked", "completed", "cancelled"].includes(item.deliveryStatus) ? item.deliveryStatus : "booked";

  return {
    status,
    scheduledAt: item.scheduledAt ? toInputDate(item.scheduledAt) : getLocalDateTimeInputValue(),
    eta: item.eta ? toInputDate(item.eta) : "",
    trackingLink: item.trackingLink ?? "",
    riderName: item.riderName ?? "",
    riderPlate: item.riderPlate ?? "",
    bookingNotes: item.bookingNotes ?? ""
  };
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
