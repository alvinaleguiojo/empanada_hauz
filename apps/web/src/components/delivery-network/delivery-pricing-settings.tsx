"use client";

import { FormEvent, useEffect, useState } from "react";
import { Calculator, Save } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type DeliveryPricing = { baseFare: number; perKmRate: number };

export function DeliveryPricingSettings({ initialPricing }: { initialPricing: DeliveryPricing }) {
  const [baseFare, setBaseFare] = useState(String(initialPricing.baseFare));
  const [perKmRate, setPerKmRate] = useState(String(initialPricing.perKmRate));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBaseFare(String(initialPricing.baseFare));
    setPerKmRate(String(initialPricing.perKmRate));
  }, [initialPricing.baseFare, initialPricing.perKmRate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const parsedBaseFare = Number(baseFare);
    const parsedPerKmRate = Number(perKmRate);
    if (!Number.isFinite(parsedBaseFare) || parsedBaseFare < 0) {
      setError("Base fare must be a non-negative number.");
      return;
    }
    if (!Number.isFinite(parsedPerKmRate) || parsedPerKmRate < 0) {
      setError("Per-kilometer rate must be a non-negative number.");
      return;
    }

    setSaving(true);
    try {
      const saved = await apiFetch<DeliveryPricing>("/delivery-network/pricing", {
        method: "PATCH",
        body: JSON.stringify({ baseFare: parsedBaseFare, perKmRate: parsedPerKmRate })
      });
      setBaseFare(String(saved.baseFare));
      setPerKmRate(String(saved.perKmRate));
      setMessage("Delivery pricing updated. New quotes use the new rates immediately.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update delivery pricing.");
    } finally {
      setSaving(false);
    }
  }

  const exampleDistance = 5;
  const exampleFare = Math.ceil(Number(baseFare || 0) + exampleDistance * Number(perKmRate || 0));

  return (
    <Card>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-foreground/55">Customer quotes and own-rider delivery estimates use these rates.</p>
          <h2 className="text-xl font-semibold">Delivery Pricing</h2>
        </div>
        <Calculator size={20} className="text-foreground/45" />
      </div>

      <form onSubmit={submit} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="space-y-2 text-sm font-medium">
          <span>Base fare (₱)</span>
          <Input type="number" min="0" step="0.01" value={baseFare} onChange={(event) => setBaseFare(event.target.value)} required />
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>Per km rate (₱)</span>
          <Input type="number" min="0" step="0.01" value={perKmRate} onChange={(event) => setPerKmRate(event.target.value)} required />
        </label>
        <Button type="submit" disabled={saving}>
          <Save size={16} />
          {saving ? "Saving…" : "Save pricing"}
        </Button>
      </form>

      <div className="mt-5 rounded-lg border border-line bg-black/10 px-4 py-3 text-sm">
        <p className="font-medium">Formula</p>
        <p className="mt-1 text-foreground/55">₱{Number(baseFare || 0).toFixed(2)} base + ₱{Number(perKmRate || 0).toFixed(2)} × distance in km, rounded up to the next peso.</p>
        <p className="mt-2 text-foreground/45">Example at {exampleDistance} km: ₱{exampleFare.toFixed(2)}</p>
      </div>

      {error ? <p className="mt-4 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mt-4 rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-sm">{message}</p> : null}
    </Card>
  );
}
