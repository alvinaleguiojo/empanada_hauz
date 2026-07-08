"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, MapPin, Phone, Sparkles, ShoppingCart } from "lucide-react";
import { apiFetch } from "@/lib/api";

const flavorOptions = [
  { label: "Pork Regular", value: "Pork Regular", price: 20 },
  { label: "Pork with Egg", value: "Pork with Egg", price: 25 },
  { label: "Chicken", value: "Chicken", price: 20 },
  { label: "Chicken with Egg", value: "Chicken with Egg", price: 25 },
  { label: "Ham & Cheese", value: "Ham & Cheese", price: 25 },
  { label: "Beef", value: "Beef", price: 35 },
  { label: "Beef with Egg", value: "Beef with Egg", price: 40 },
  { label: "Ube with Cheese", value: "Ube with Cheese", price: 25 },
  { label: "Choco Flavor", value: "Choco Flavor", price: 30 },
  { label: "Mango Flavor", value: "Mango Flavor", price: 25 }
];

const deliveryMethods = [
  { label: "Pickup", value: "pickup" },
  { label: "Delivery", value: "maxim" }
];

const paymentMethods = [
  { label: "Cash on Delivery", value: "cod" },
  { label: "GCash", value: "gcash" }
];

type SelectedFlavor = {
  value: string;
  quantity: number;
};

type FormState = {
  deliveryDate: string;
  deliveryTime: string;
  customerName: string;
  address: string;
  landmark: string;
  phoneNumber: string;
  paymentMethod: string;
  deliveryMethod: string;
  notes: string;
};

const initialState: FormState = {
  deliveryDate: "",
  deliveryTime: "",
  customerName: "",
  address: "",
  landmark: "",
  phoneNumber: "",
  paymentMethod: "cod",
  deliveryMethod: "pickup",
  notes: ""
};

const steps = [
  { title: "Choose flavors", subtitle: "Pick one or more flavors" },
  { title: "Delivery details", subtitle: "Set your delivery window" },
  { title: "Review & submit", subtitle: "Confirm your order" }
];

export default function CustomerKioskPage() {
  const [step, setStep] = useState(0);
  const [selectedFlavors, setSelectedFlavors] = useState<SelectedFlavor[]>([]);
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    const items = selectedFlavors.map((item) => {
      const flavor = flavorOptions.find((option) => option.value === item.value);
      if (!flavor) {
        return null;
      }
      const quantity = Math.max(1, Number(item.quantity || 1));
      return {
        name: flavor.value,
        quantity,
        price: flavor.price,
        subtotal: quantity * flavor.price
      };
    }).filter(Boolean) as Array<{ name: string; quantity: number; price: number; subtotal: number }>;

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);

    return { items, totalQuantity, subtotal };
  }, [selectedFlavors]);

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleFlavor = (value: string) => {
    setSelectedFlavors((current) => {
      const existing = current.find((item) => item.value === value);
      if (existing) {
        return current.filter((item) => item.value !== value);
      }
      return [...current, { value, quantity: 1 }];
    });
  };

  const updateFlavorQuantity = (value: string, quantity: number) => {
    setSelectedFlavors((current) => current.map((item) => (item.value === value ? { ...item, quantity: Math.max(1, quantity) } : item)));
  };

  const isStepValid = step === 0 ? summary.items.length > 0 : true;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (summary.items.length === 0) {
      setError("Please select at least one flavor.");
      return;
    }

    setError(null);
    setSuccess(false);
    setSubmitting(true);

    try {
      const preferredSchedule = form.deliveryDate && form.deliveryTime ? `${form.deliveryDate}T${form.deliveryTime}` : undefined;
      await apiFetch("/orders/public", {
        method: "POST",
        body: JSON.stringify({
          customerName: form.customerName,
          phoneNumber: form.phoneNumber,
          address: form.address,
          landmark: form.landmark,
          quantity: summary.totalQuantity,
          unitPrice: 0,
          deliveryMethod: form.deliveryMethod,
          paymentMethod: form.paymentMethod,
          preferredSchedule,
          items: summary.items,
          notes: form.notes.trim() || undefined
        })
      });
      setSuccess(true);
      setSelectedFlavors([]);
      setForm(initialState);
      setStep(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to place order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,166,77,0.22),_transparent_35%),linear-gradient(135deg,_#060816,_#0f172a_60%,_#111827)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-white/10 shadow-2xl shadow-black/25 backdrop-blur-xl">
          <div className="border-b border-white/10 bg-gradient-to-r from-orange-500/25 via-amber-400/10 to-transparent px-6 py-6 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm uppercase tracking-[0.35em] text-orange-200">
                  <Sparkles size={16} /> Empanada Hauz Kiosk
                </p>
                <h1 className="text-3xl font-semibold sm:text-4xl">Fast, guided ordering</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-200 sm:text-base">Choose multiple flavors, set your preferences, and finish checkout in just a few taps.</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-slate-950/40 px-4 py-3 text-sm text-slate-100">
                <div className="flex items-center gap-2 font-medium">
                  <ShoppingCart size={16} /> Step-by-step checkout
                </div>
                <div className="mt-1 text-xs text-slate-300">Modern • Friendly • Quick</div>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 sm:px-8">
            <div className="flex flex-wrap gap-2">
              {steps.map((item, index) => {
                const active = index === step;
                const complete = index < step;
                return (
                  <div key={item.title} className={`rounded-full border px-3 py-2 text-sm ${active ? "border-orange-400 bg-orange-500/20 text-orange-100" : complete ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/5 text-slate-300"}`}>
                    <span className="mr-2 font-semibold">{index + 1}</span>
                    {item.title}
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              {step === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">Select your flavors</h2>
                      <p className="mt-1 text-sm text-slate-300">Tap as many as you like and set the quantity for each.</p>
                    </div>
                    <div className="rounded-full bg-orange-500/15 px-3 py-1 text-xs font-medium text-orange-200">Pick one or more</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {flavorOptions.map((option) => {
                      const selected = selectedFlavors.find((item) => item.value === option.value);
                      return (
                        <div key={option.value} className={`rounded-2xl border p-4 transition ${selected ? "border-orange-400 bg-orange-500/20 shadow-lg shadow-orange-500/10" : "border-white/10 bg-white/5 hover:border-orange-300/40 hover:bg-white/10"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <button type="button" onClick={() => toggleFlavor(option.value)} className="text-left">
                              <div className="font-semibold">{option.label}</div>
                              <div className="mt-1 text-sm text-slate-300">Php {option.price}</div>
                            </button>
                            {selected ? <CheckCircle2 size={18} className="text-orange-300" /> : null}
                          </div>
                          {selected ? (
                            <label className="mt-3 block">
                              <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Qty</span>
                              <input
                                type="number"
                                min="1"
                                value={selected.quantity}
                                onChange={(event) => updateFlavorQuantity(option.value, Number(event.target.value || 1))}
                                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2.5 outline-none"
                              />
                            </label>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4 sm:p-5">
                    <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
                      <MapPin size={18} className="text-orange-300" /> Delivery preferences
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                        <span className="mb-2 block text-sm font-medium text-slate-200">Delivery method</span>
                        <select value={form.deliveryMethod} onChange={(event) => handleChange("deliveryMethod", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 outline-none">
                          {deliveryMethods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                        <span className="mb-2 block text-sm font-medium text-slate-200">Payment method</span>
                        <select value={form.paymentMethod} onChange={(event) => handleChange("paymentMethod", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 outline-none">
                          {paymentMethods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
                      <span className="mb-2 block text-sm font-medium text-slate-200">Delivery date</span>
                      <input type="date" value={form.deliveryDate} onChange={(event) => handleChange("deliveryDate", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none" />
                    </label>
                    <label className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
                      <span className="mb-2 block text-sm font-medium text-slate-200">Delivery time</span>
                      <input type="time" value={form.deliveryTime} onChange={(event) => handleChange("deliveryTime", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none" />
                    </label>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
                    <Phone size={18} className="text-orange-300" /> Customer details
                  </div>
                  <div className="space-y-3">
                    <input placeholder="Customer name" value={form.customerName} onChange={(event) => handleChange("customerName", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none" required />
                    <input placeholder="Contact number" value={form.phoneNumber} onChange={(event) => handleChange("phoneNumber", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none" required />
                    <input placeholder="Address" value={form.address} onChange={(event) => handleChange("address", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none" required />
                    <input placeholder="Landmark" value={form.landmark} onChange={(event) => handleChange("landmark", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none" required />
                    <textarea placeholder="Optional note" value={form.notes} onChange={(event) => handleChange("notes", event.target.value)} className="min-h-[96px] w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none" />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-orange-400/25 bg-orange-500/10 p-4 sm:p-5">
                <div className="flex items-center justify-between text-sm text-slate-200">
                  <span>Selected items</span>
                  <span className="font-semibold text-white">{summary.totalQuantity} pcs</span>
                </div>
                <div className="mt-3 space-y-2">
                  {summary.items.length > 0 ? summary.items.map((item) => (
                    <div key={item.name} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm">
                      <span>{item.name}</span>
                      <span className="text-slate-300">{item.quantity} × Php {item.price}</span>
                    </div>
                  )) : <p className="rounded-2xl border border-dashed border-white/10 px-3 py-3 text-sm text-slate-300">No flavors selected yet.</p>}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-sm text-slate-200">
                  <span>Total</span>
                  <span className="text-xl font-semibold text-orange-300">Php {summary.subtotal}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/10" disabled={step === 0}>
                  <ArrowLeft size={16} /> Back
                </button>
                {step < steps.length - 1 ? (
                  <button type="button" onClick={() => setStep((current) => current + 1)} disabled={!isStepValid} className="ml-auto flex items-center gap-2 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60">
                    Continue <ArrowRight size={16} />
                  </button>
                ) : (
                  <button type="submit" disabled={submitting} className="ml-auto rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60">
                    {submitting ? "Placing order..." : "Place order"}
                  </button>
                )}
              </div>

              {error ? <p className="text-sm text-rose-300">{error}</p> : null}
              {success ? <p className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 size={16} /> Your order was received. We’ll contact you shortly.</p> : null}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
