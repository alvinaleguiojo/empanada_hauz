"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Clock3, MapPin, Phone, Sparkles, ShoppingCart } from "lucide-react";
import { apiFetch } from "@/lib/api";

const flavorOptions = [
  { label: "Pork Regular", value: "Pork Regular", price: 20 },
  { label: "Pork with Egg", value: "Pork with Egg", price: 25 },
  { label: "Ham & Cheese", value: "Ham & Cheese", price: 25 },
  { label: "Chicken", value: "Chicken", price: 20 },
  { label: "Beef", value: "Beef", price: 35 },
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

type FormState = {
  flavor: string;
  quantity: string;
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
  flavor: flavorOptions[0].value,
  quantity: "1",
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

export default function CustomerKioskPage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedFlavor = flavorOptions.find((item) => item.value === form.flavor) ?? flavorOptions[0];
  const total = Number(form.quantity || 0) * selectedFlavor.price;

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
          quantity: Number(form.quantity || 1),
          unitPrice: selectedFlavor.price,
          deliveryMethod: form.deliveryMethod,
          paymentMethod: form.paymentMethod,
          preferredSchedule,
          items: [{ name: selectedFlavor.value, quantity: Number(form.quantity || 1), price: selectedFlavor.price, subtotal: total }],
          notes: form.notes.trim() || undefined
        })
      });
      setSuccess(true);
      setForm(initialState);
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
                <h1 className="text-3xl font-semibold sm:text-4xl">Order your favorites in minutes</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-200 sm:text-base">Choose a flavor, set your quantity, select your delivery window, and we’ll take care of the rest.</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-slate-950/40 px-4 py-3 text-sm text-slate-100">
                <div className="flex items-center gap-2 font-medium">
                  <ShoppingCart size={16} /> Quick checkout
                </div>
                <div className="mt-1 text-xs text-slate-300">Fast • Modern • Customer-friendly</div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Pick your flavor</h2>
                  <div className="rounded-full bg-orange-500/15 px-3 py-1 text-xs font-medium text-orange-200">Fresh today</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {flavorOptions.map((option) => {
                    const active = form.flavor === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleChange("flavor", option.value)}
                        className={`rounded-2xl border p-4 text-left transition ${active ? "border-orange-400 bg-orange-500/20 shadow-lg shadow-orange-500/10" : "border-white/10 bg-white/5 hover:border-orange-300/40 hover:bg-white/10"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold">{option.label}</div>
                            <div className="mt-1 text-sm text-slate-300">Php {option.price}</div>
                          </div>
                          {active ? <CheckCircle2 size={18} className="text-orange-300" /> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Quantity</span>
                  <input
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(event) => handleChange("quantity", event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none ring-0"
                    required
                  />
                </label>
                <label className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Delivery method</span>
                  <select
                    value={form.deliveryMethod}
                    onChange={(event) => handleChange("deliveryMethod", event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none"
                  >
                    {deliveryMethods.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Delivery date</span>
                  <input
                    type="date"
                    value={form.deliveryDate}
                    onChange={(event) => handleChange("deliveryDate", event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none"
                  />
                </label>
                <label className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Delivery time</span>
                  <input
                    type="time"
                    value={form.deliveryTime}
                    onChange={(event) => handleChange("deliveryTime", event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none"
                  />
                </label>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <MapPin size={18} className="text-orange-300" /> Customer details
                </div>
                <div className="space-y-3">
                  <input placeholder="Customer name" value={form.customerName} onChange={(event) => handleChange("customerName", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none" required />
                  <input placeholder="Contact number" value={form.phoneNumber} onChange={(event) => handleChange("phoneNumber", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none" required />
                  <input placeholder="Address" value={form.address} onChange={(event) => handleChange("address", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none" required />
                  <input placeholder="Landmark" value={form.landmark} onChange={(event) => handleChange("landmark", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none" required />
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <Phone size={18} className="text-orange-300" /> Payment
                </div>
                <select value={form.paymentMethod} onChange={(event) => handleChange("paymentMethod", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none">
                  {paymentMethods.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <textarea placeholder="Optional note" value={form.notes} onChange={(event) => handleChange("notes", event.target.value)} className="mt-3 min-h-[96px] w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 outline-none" />
              </div>

              <div className="rounded-3xl border border-orange-400/25 bg-orange-500/10 p-4 sm:p-5">
                <div className="flex items-center justify-between text-sm text-slate-200">
                  <span>Selected flavor</span>
                  <span className="font-semibold text-white">{selectedFlavor.label}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-slate-200">
                  <span>Subtotal</span>
                  <span className="text-xl font-semibold text-orange-300">Php {total}</span>
                </div>
                <button type="submit" disabled={submitting} className="mt-4 w-full rounded-2xl bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-70">
                  {submitting ? "Placing order..." : "Place order"}
                </button>
                {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
                {success ? <p className="mt-3 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 size={16} /> Your order was received. We’ll contact you shortly.</p> : null}
              </div>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
