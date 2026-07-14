"use client";

import { FormEvent, useMemo, useState } from "react";
import { Baloo_2, Caveat, IBM_Plex_Mono } from "next/font/google";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChefHat,
  Copy,
  ExternalLink,
  Flame,
  Minus,
  Phone,
  Plus,
  Ticket,
  Truck,
  Wallet
} from "lucide-react";
import { apiFetch } from "@/lib/api";

const display = Baloo_2({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const script = Caveat({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-script" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-mono" });

const flavorOptions = [
  { label: "Pork Regular", value: "Pork Regular", price: 20 },
  { label: "Pork with Egg", value: "Pork with Egg", price: 25, popular: true },
  { label: "Chicken", value: "Chicken", price: 20 },
  { label: "Chicken with Egg", value: "Chicken with Egg", price: 25, popular: true },
  { label: "Ham & Cheese", value: "Ham & Cheese", price: 25 },
  { label: "Beef", value: "Beef", price: 35, popular: true },
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
  quantity: string;
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

type PublicOrderResponse = {
  order: {
    id: string;
    orderNumber?: string;
  };
  trackingPath?: string;
};

type SuccessState = {
  orderNumber?: string;
  trackingPath: string;
  trackingUrl: string;
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

function formatHourLabel(time24: string) {
  const [hourStr] = time24.split(":");
  const hour = Number(hourStr);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:00 ${period}`;
}

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
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);

  const summary = useMemo(() => {
    const items = selectedFlavors.map((item) => {
      const flavor = flavorOptions.find((option) => option.value === item.value);
      if (!flavor) {
        return null;
      }
      const quantity = Math.max(0, Number(item.quantity || 0));
      if (quantity < 1) {
        return null;
      }

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

  const todayDateString = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  // If the delivery date is today, the earliest selectable time is the start
  // of the next full hour — e.g. at 10:15 the earliest option is 11:00, not
  // any time within the current hour.
  const minDeliveryTime = useMemo(() => {
    if (form.deliveryDate !== todayDateString) {
      return undefined;
    }
    const now = new Date();
    const nextHour = (now.getHours() + 1) % 24;
    return `${String(nextHour).padStart(2, "0")}:00`;
  }, [form.deliveryDate, todayDateString]);

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleFlavor = (value: string) => {
    setSelectedFlavors((current) => {
      const existing = current.find((item) => item.value === value);
      if (existing) {
        return current.filter((item) => item.value !== value);
      }
      return [...current, { value, quantity: "1" }];
    });
  };

  const updateFlavorQuantity = (value: string, quantity: string) => {
    const normalized = quantity.replace(/[^\d]/g, "");
    setSelectedFlavors((current) => {
      const existing = current.find((item) => item.value === value);
      if (!existing) {
        return current;
      }
      return current.map((item) => (item.value === value ? { ...item, quantity: normalized } : item));
    });
  };

  const stepFlavorQuantity = (value: string, delta: number) => {
    setSelectedFlavors((current) => {
      const existing = current.find((item) => item.value === value);
      if (!existing) {
        return current;
      }

      return current.map((item) => {
        if (item.value !== value) {
          return item;
        }

        const nextQuantity = Math.max(1, Number(item.quantity || 0) + delta);
        return { ...item, quantity: String(nextQuantity) };
      });
    });
  };

  const isStepValid = step === 0 ? summary.items.length > 0 && summary.totalQuantity >= 10 : true;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (summary.items.length === 0) {
      setError("Please select at least one flavor.");
      return;
    }

    if (summary.totalQuantity < 10) {
      setError("Minimum order is 10 pieces. Please increase the quantity.");
      return;
    }

    if (!agreedToPolicy) {
      setError("Please agree to the Privacy Policy before placing your order.");
      return;
    }

    if (form.deliveryDate && form.deliveryTime) {
      const scheduled = new Date(`${form.deliveryDate}T${form.deliveryTime}`);
      if (scheduled.getTime() < Date.now()) {
        setError("Your selected delivery date/time has already passed. Please choose a later time.");
        return;
      }
    }

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const preferredSchedule = form.deliveryDate && form.deliveryTime ? `${form.deliveryDate}T${form.deliveryTime}` : undefined;
      const result = await apiFetch<PublicOrderResponse>("/orders/public", {
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
      const trackingPath = result.trackingPath ?? `/track/${result.order.id}`;
      const origin = typeof window === "undefined" ? "" : window.location.origin;
      setSuccess({
        orderNumber: result.order.orderNumber,
        trackingPath,
        trackingUrl: `${origin}${trackingPath}`
      });
      setSelectedFlavors([]);
      setForm(initialState);
      setAgreedToPolicy(false);
      setStep(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to place order");
    } finally {
      setSubmitting(false);
    }
  };

  const remaining = Math.max(0, 10 - summary.totalQuantity);

  const handleStartNewOrder = () => {
    setSuccess(null);
    setError(null);
  };

  if (success) {
    return (
      <main className={`${display.variable} ${script.variable} ${mono.variable} kiosk-board flex min-h-screen items-center justify-center px-4 py-10 text-[#F2E8D5] sm:px-6`}>
        <div className="w-full max-w-md">
          <div className="overflow-hidden rounded-[26px] border-[3px] border-[#3a2c1c] bg-[#241c13] shadow-[0_18px_50px_-15px_rgba(0,0,0,0.7)]">
            <div className="jeepney-stripe h-2.5 w-full" />
            <div className="p-6 sm:p-8">
              <div className="flex flex-col items-center text-center">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-[#7A9B4E] text-[#1a140d]">
                  <CheckCircle2 size={32} />
                </span>
                <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl text-[#F6EFDD]">Order received!</h1>
                <p className="mt-2 font-[family-name:var(--font-script)] text-xl text-[#F2E8D5]/75">salamat po, we're on it</p>

                {success.orderNumber ? (
                  <p className="mt-4 inline-block rounded border border-dashed border-[#F2E8D5]/30 px-3 py-1 font-[family-name:var(--font-mono)] text-sm text-[#F2E8D5]/70">
                    Order {success.orderNumber}
                  </p>
                ) : null}

                <p className="mt-5 text-sm text-[#F2E8D5]/60">Use this link to track your order status anytime.</p>
                <div className="mt-3 grid w-full gap-2">
                  <input
                    readOnly
                    value={success.trackingUrl}
                    className="w-full min-w-0 rounded-lg border-2 border-[#3a2c1c] bg-[#1a140d] px-3 py-2.5 text-center font-[family-name:var(--font-mono)] text-xs text-[#F2E8D5] outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(success.trackingUrl)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-[#3a2c1c] bg-[#1c150e] px-3 py-2.5 font-semibold text-[#F2E8D5] transition active:bg-[#E3A64B]/15"
                    >
                      <Copy size={15} /> Copy
                    </button>
                    <a
                      href={success.trackingPath}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#7A9B4E] px-3 py-2.5 font-semibold text-[#1a140d] transition hover:bg-[#6c8a43]"
                    >
                      Track <ExternalLink size={15} />
                    </a>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleStartNewOrder}
                  className="mt-6 w-full rounded-xl bg-[#C0472B] px-5 py-3.5 text-sm font-bold uppercase tracking-wide text-[#F6EFDD] shadow-[0_10px_25px_-10px_rgba(192,71,43,0.7)] transition active:bg-[#a83c24]"
                >
                  Place another order
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`${display.variable} ${script.variable} ${mono.variable} kiosk-board min-h-screen px-4 py-6 pb-28 text-[#F2E8D5] sm:px-6 lg:px-8 lg:pb-6`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <section className="overflow-hidden rounded-[26px] border-[3px] border-[#3a2c1c] bg-[#241c13] shadow-[0_18px_50px_-15px_rgba(0,0,0,0.7)]">
          <div className="jeepney-stripe h-2.5 w-full" />
          <div className="relative overflow-hidden px-6 py-7 sm:px-9">
            <div className="chalk-texture pointer-events-none absolute inset-0" />
            <div className="relative flex flex-wrap items-center justify-between gap-5">
              <div>
                <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#E3A64B]/40 bg-[#E3A64B]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-[#E3A64B]">
                  <ChefHat size={14} /> Empanada Hauz
                </p>
                <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] tracking-tight text-[#F6EFDD] sm:text-5xl">
                  Fresh from the pan,
                  <br />
                  <span className="text-[#E3A64B]">straight to your door.</span>
                </h1>
                <p className="mt-3 max-w-xl font-[family-name:var(--font-script)] text-xl text-[#F2E8D5]/80 sm:text-2xl">
                  ~ pick your flavors, we do the rest ~
                </p>
              </div>
              <div className="rotate-[-2deg] rounded-xl border-2 border-dashed border-[#F2E8D5]/30 bg-[#1a140d] px-4 py-3 text-sm shadow-inner">
                <div className="flex items-center gap-2 font-semibold text-[#F6EFDD]">
                  <Ticket size={16} className="text-[#E3A64B]" /> Order slip #{step + 1}/3
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-[#F2E8D5]/55">10 pcs minimum</div>
              </div>
            </div>
          </div>

          <div className="border-t border-[#3a2c1c] bg-[#1c150e] px-6 py-4 sm:px-9">
            <div className="flex flex-wrap gap-2.5">
              {steps.map((item, index) => {
                const active = index === step;
                const complete = index < step;
                const reachable = complete;
                return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => reachable && setStep(index)}
                    disabled={!reachable}
                    className={`flex items-center gap-2 rounded-lg border-2 px-3.5 py-2 text-sm transition ${
                      active
                        ? "border-[#E3A64B] bg-[#E3A64B]/15 text-[#F6EFDD]"
                        : complete
                        ? "border-[#7A9B4E]/50 bg-[#7A9B4E]/10 text-[#c9dba6] active:bg-[#7A9B4E]/20"
                        : "border-[#3a2c1c] bg-transparent text-[#F2E8D5]/45"
                    } ${reachable ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                        active ? "bg-[#E3A64B] text-[#1a140d]" : complete ? "bg-[#7A9B4E] text-[#1a140d]" : "bg-[#3a2c1c] text-[#F2E8D5]/60"
                      }`}
                    >
                      {complete ? <CheckCircle2 size={13} /> : index + 1}
                    </span>
                    <span className="font-medium">{item.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <form id="kiosk-order-form" onSubmit={handleSubmit} className="grid gap-6 p-6 sm:p-9 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-5">
              {step === 0 ? (
                <div className="rounded-2xl border-2 border-[#3a2c1c] bg-[#1c150e] p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-[family-name:var(--font-display)] text-2xl text-[#F6EFDD]">Today&apos;s flavors</h2>
                      <p className="mt-1 text-sm text-[#F2E8D5]/60">Tap as many as you like, set quantity per flavor.</p>
                    </div>
                    <div className="rounded-full border border-[#E3A64B]/40 bg-[#E3A64B]/10 px-3 py-1 text-xs font-semibold text-[#E3A64B]">
                      Pick one or more
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {flavorOptions.map((option) => {
                      const selected = selectedFlavors.find((item) => item.value === option.value);
                      return (
                        <div
                          key={option.value}
                          className={`relative rounded-xl border-2 p-4 transition ${
                            selected
                              ? "border-[#E3A64B] bg-[#E3A64B]/12 shadow-[0_10px_25px_-12px_rgba(227,166,75,0.55)]"
                              : "border-[#3a2c1c] bg-[#241c13] hover:border-[#E3A64B]/40"
                          }`}
                        >
                          {option.popular ? (
                            <span className="absolute -top-2.5 right-3 inline-flex items-center gap-1 rounded-full bg-[#C0472B] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#F6EFDD] shadow">
                              <Flame size={10} /> Best seller
                            </span>
                          ) : null}
                          <button type="button" onClick={() => toggleFlavor(option.value)} className="w-full text-left">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-[family-name:var(--font-display)] text-base text-[#F6EFDD]">{option.label}</div>
                                <div className="mt-1 font-[family-name:var(--font-mono)] text-sm text-[#E3A64B]">Php {option.price}</div>
                              </div>
                              {selected ? (
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#E3A64B] text-[#1a140d]">
                                  <CheckCircle2 size={15} />
                                </span>
                              ) : (
                                <span className="h-6 w-6 shrink-0 rounded-full border-2 border-dashed border-[#F2E8D5]/25" />
                              )}
                            </div>
                          </button>
                          {selected ? (
                            <label className="mt-3 block" onClick={(event) => event.stopPropagation()}>
                              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.25em] text-[#F2E8D5]/45">Qty</span>
                              <div className="flex items-stretch gap-2">
                                <div className="grid h-12 flex-1 grid-cols-[44px_minmax(0,1fr)_44px] overflow-hidden rounded-lg border-2 border-[#3a2c1c] bg-[#1a140d]">
                                  <button
                                    type="button"
                                    aria-label={`Decrease ${option.label}`}
                                    onClick={() => stepFlavorQuantity(option.value, -1)}
                                    className="flex h-full items-center justify-center border-r-2 border-[#3a2c1c] text-[#E3A64B] transition active:bg-[#E3A64B]/15"
                                  >
                                    <Minus size={16} />
                                  </button>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    aria-label={`${option.label} quantity`}
                                    value={selected.quantity}
                                    onChange={(event) => updateFlavorQuantity(option.value, event.target.value)}
                                    onFocus={(event) => event.currentTarget.select()}
                                    className="h-full min-w-0 bg-transparent px-3 text-center font-[family-name:var(--font-mono)] text-base font-semibold text-[#F6EFDD] outline-none"
                                  />
                                  <button
                                    type="button"
                                    aria-label={`Increase ${option.label}`}
                                    onClick={() => stepFlavorQuantity(option.value, 1)}
                                    className="flex h-full items-center justify-center border-l-2 border-[#3a2c1c] text-[#E3A64B] transition active:bg-[#E3A64B]/15"
                                  >
                                    <Plus size={16} />
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  aria-label={`Add 5 ${option.label}`}
                                  onClick={() => stepFlavorQuantity(option.value, 5)}
                                  className="h-12 shrink-0 rounded-lg border-2 border-[#3a2c1c] bg-[#1a140d] px-3 font-[family-name:var(--font-mono)] text-xs font-bold text-[#E3A64B] transition active:bg-[#E3A64B]/15"
                                >
                                  +5
                                </button>
                              </div>
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
                  <div className="rounded-2xl border-2 border-[#3a2c1c] bg-[#1c150e] p-4 sm:p-5">
                    <div className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-lg text-[#F6EFDD]">
                      <Truck size={18} className="text-[#E3A64B]" /> Delivery preferences
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="rounded-xl border-2 border-[#3a2c1c] bg-[#241c13] p-4">
                        <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#F2E8D5]/75"><Truck size={14} /> Delivery method</span>
                        <select
                          value={form.deliveryMethod}
                          onChange={(event) => handleChange("deliveryMethod", event.target.value)}
                          className="w-full rounded-lg border-2 border-[#3a2c1c] bg-[#1a140d] px-3 py-3 text-[#F6EFDD] outline-none"
                        >
                          {deliveryMethods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="rounded-xl border-2 border-[#3a2c1c] bg-[#241c13] p-4">
                        <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#F2E8D5]/75"><Wallet size={14} /> Payment method</span>
                        <select
                          value={form.paymentMethod}
                          onChange={(event) => handleChange("paymentMethod", event.target.value)}
                          className="w-full rounded-lg border-2 border-[#3a2c1c] bg-[#1a140d] px-3 py-3 text-[#F6EFDD] outline-none"
                        >
                          {paymentMethods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="rounded-2xl border-2 border-[#3a2c1c] bg-[#1c150e] p-4">
                      <span className="mb-2 block text-sm font-medium text-[#F2E8D5]/75">Delivery date</span>
                      <input
                        type="date"
                        value={form.deliveryDate}
                        min={todayDateString}
                        onChange={(event) => {
                          const nextDate = event.target.value;
                          handleChange("deliveryDate", nextDate);
                          // Clear a previously chosen time if it's no longer valid for the new date
                          if (nextDate === todayDateString && form.deliveryTime) {
                            const now = new Date();
                            const nextHour = (now.getHours() + 1) % 24;
                            const minTime = `${String(nextHour).padStart(2, "0")}:00`;
                            if (form.deliveryTime < minTime) {
                              handleChange("deliveryTime", "");
                            }
                          }
                        }}
                        className="w-full rounded-lg border-2 border-[#3a2c1c] bg-[#241c13] px-4 py-3 text-[#F6EFDD] outline-none"
                      />
                    </label>
                    <label className="rounded-2xl border-2 border-[#3a2c1c] bg-[#1c150e] p-4">
                      <span className="mb-2 block text-sm font-medium text-[#F2E8D5]/75">Delivery time</span>
                      <input
                        type="time"
                        value={form.deliveryTime}
                        min={minDeliveryTime}
                        onChange={(event) => handleChange("deliveryTime", event.target.value)}
                        className="w-full rounded-lg border-2 border-[#3a2c1c] bg-[#241c13] px-4 py-3 text-[#F6EFDD] outline-none"
                      />
                      {minDeliveryTime ? (
                        <span className="mt-1.5 block text-xs text-[#F2E8D5]/40">Earliest today: {formatHourLabel(minDeliveryTime)}</span>
                      ) : null}
                    </label>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="rounded-2xl border-2 border-[#3a2c1c] bg-[#1c150e] p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-lg text-[#F6EFDD]">
                    <Phone size={18} className="text-[#E3A64B]" /> Customer details
                  </div>
                  <div className="space-y-3">
                    <input
                      placeholder="Customer name"
                      value={form.customerName}
                      onChange={(event) => handleChange("customerName", event.target.value)}
                      className="w-full rounded-lg border-2 border-[#3a2c1c] bg-[#241c13] px-4 py-3 text-[#F6EFDD] outline-none placeholder:text-[#F2E8D5]/35"
                      required
                    />
                    <input
                      placeholder="Contact number"
                      value={form.phoneNumber}
                      onChange={(event) => handleChange("phoneNumber", event.target.value)}
                      className="w-full rounded-lg border-2 border-[#3a2c1c] bg-[#241c13] px-4 py-3 text-[#F6EFDD] outline-none placeholder:text-[#F2E8D5]/35"
                      required
                    />
                    <input
                      placeholder="Address"
                      value={form.address}
                      onChange={(event) => handleChange("address", event.target.value)}
                      className="w-full rounded-lg border-2 border-[#3a2c1c] bg-[#241c13] px-4 py-3 text-[#F6EFDD] outline-none placeholder:text-[#F2E8D5]/35"
                      required
                    />
                    <input
                      placeholder="Landmark"
                      value={form.landmark}
                      onChange={(event) => handleChange("landmark", event.target.value)}
                      className="w-full rounded-lg border-2 border-[#3a2c1c] bg-[#241c13] px-4 py-3 text-[#F6EFDD] outline-none placeholder:text-[#F2E8D5]/35"
                      required
                    />
                    <textarea
                      placeholder="Optional note"
                      value={form.notes}
                      onChange={(event) => handleChange("notes", event.target.value)}
                      className="min-h-[96px] w-full rounded-lg border-2 border-[#3a2c1c] bg-[#241c13] px-4 py-3 text-[#F6EFDD] outline-none placeholder:text-[#F2E8D5]/35"
                    />
                  </div>

                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border-2 border-[#3a2c1c] bg-[#241c13] p-3.5">
                    <input
                      type="checkbox"
                      checked={agreedToPolicy}
                      onChange={(event) => setAgreedToPolicy(event.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[#C0472B]"
                    />
                    <span className="text-sm text-[#F2E8D5]/75">
                      I agree that Empanada Hauz may collect and use my name, contact number, and address to process and deliver this order, as described in the{" "}
                      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-[#E3A64B] underline underline-offset-2">
                        Privacy Policy
                      </a>
                      .
                    </span>
                  </label>
                </div>
              ) : null}
            </div>

            <div className="space-y-5">
              <div className="receipt-ticket relative bg-[#f2e8d5] px-5 pb-6 pt-7 text-[#241c13] shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)]">
                <div className="mb-3 flex items-center justify-between border-b-2 border-dashed border-[#241c13]/25 pb-3">
                  <div className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-[0.15em]">
                    <Ticket size={16} /> Your order
                  </div>
                  <span className={`font-[family-name:var(--font-mono)] text-sm font-semibold ${summary.totalQuantity >= 10 ? "text-[#4f6a34]" : "text-[#C0472B]"}`}>
                    {summary.totalQuantity} pcs
                  </span>
                </div>
                <div className="space-y-1.5 font-[family-name:var(--font-mono)] text-sm">
                  {summary.items.length > 0 ? (
                    summary.items.map((item) => (
                      <div key={item.name} className="flex items-center justify-between gap-2">
                        <span className="truncate">{item.quantity}x {item.name}</span>
                        <span className="shrink-0 tabular-nums">{item.subtotal}</span>
                      </div>
                    ))
                  ) : (
                    <p className="py-2 text-[#241c13]/50">No flavors selected yet.</p>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between border-t-2 border-dashed border-[#241c13]/25 pt-3">
                  <span className="font-[family-name:var(--font-display)] text-base font-bold">TOTAL</span>
                  <span className="font-[family-name:var(--font-mono)] text-xl font-bold text-[#C0472B]">Php {summary.subtotal}</span>
                </div>
                <p className={`mt-3 text-center font-[family-name:var(--font-script)] text-lg ${summary.totalQuantity >= 10 ? "text-[#4f6a34]" : "text-[#C0472B]"}`}>
                  {summary.totalQuantity >= 10 ? "minimum reached, salamat!" : `add ${remaining} more piece${remaining === 1 ? "" : "s"} po`}
                </p>
              </div>

              <div className="hidden gap-3 lg:flex">
                <button
                  type="button"
                  onClick={() => setStep((current) => Math.max(0, current - 1))}
                  className="flex items-center gap-2 rounded-xl border-2 border-[#3a2c1c] bg-[#241c13] px-4 py-3 text-sm font-medium text-[#F2E8D5] transition hover:border-[#E3A64B]/40 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={step === 0}
                >
                  <ArrowLeft size={16} /> Back
                </button>
                {step < steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep((current) => current + 1)}
                    disabled={!isStepValid}
                    className="ml-auto flex items-center gap-2 rounded-xl bg-[#C0472B] px-5 py-3 text-sm font-bold uppercase tracking-wide text-[#F6EFDD] shadow-[0_10px_25px_-10px_rgba(192,71,43,0.7)] transition hover:bg-[#a83c24] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={submitting || !agreedToPolicy}
                    className="ml-auto flex items-center gap-2 rounded-xl bg-[#C0472B] px-5 py-3 text-sm font-bold uppercase tracking-wide text-[#F6EFDD] shadow-[0_10px_25px_-10px_rgba(192,71,43,0.7)] transition hover:bg-[#a83c24] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? "Placing order..." : "Place order"}
                  </button>
                )}
              </div>

              {error ? <p className="rounded-lg border-2 border-[#C0472B]/40 bg-[#C0472B]/10 px-3 py-2 text-sm text-[#f0a894]">{error}</p> : null}
            </div>
          </form>
        </section>

        <p className="pb-2 text-center font-[family-name:var(--font-script)] text-lg text-[#F2E8D5]/45">
          made fresh daily by Empanada Hauz
        </p>
      </div>

      {/* Mobile sticky action bar — keeps total + primary action always reachable while scrolling */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-[#3a2c1c] bg-[#1c150e]/97 px-3 pb-[env(safe-area-inset-bottom)] pt-2.5 shadow-[0_-12px_30px_-10px_rgba(0,0,0,0.6)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5">
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            aria-label="Back"
            disabled={step === 0}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#3a2c1c] bg-[#241c13] text-[#F2E8D5] transition active:bg-[#E3A64B]/10 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="min-w-0 flex-1 leading-tight">
            <div className="font-[family-name:var(--font-mono)] text-[11px] text-[#F2E8D5]/55">
              {summary.totalQuantity} pcs
            </div>
            <div className="truncate font-[family-name:var(--font-display)] text-base font-bold text-[#F6EFDD]">
              Php {summary.subtotal}
            </div>
          </div>

          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((current) => current + 1)}
              disabled={!isStepValid}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#C0472B] px-4 text-sm font-bold uppercase tracking-wide text-[#F6EFDD] shadow-[0_10px_25px_-10px_rgba(192,71,43,0.7)] transition active:bg-[#a83c24] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="submit"
              form="kiosk-order-form"
              disabled={submitting || !agreedToPolicy}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#C0472B] px-4 text-sm font-bold uppercase tracking-wide text-[#F6EFDD] shadow-[0_10px_25px_-10px_rgba(192,71,43,0.7)] transition active:bg-[#a83c24] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Placing..." : "Place order"}
            </button>
          )}
        </div>
        {step === 0 && summary.totalQuantity < 10 ? (
          <p className="mx-auto mt-1.5 max-w-6xl text-center font-[family-name:var(--font-script)] text-sm text-[#C0472B]">
            add {remaining} more piece{remaining === 1 ? "" : "s"} to reach the 10 pc minimum
          </p>
        ) : null}
        {step === 2 && !agreedToPolicy ? (
          <p className="mx-auto mt-1.5 max-w-6xl text-center font-[family-name:var(--font-script)] text-sm text-[#C0472B]">
            please agree to the Privacy Policy to continue
          </p>
        ) : null}
      </div>

      <style jsx global>{`
        .kiosk-board {
          background:
            radial-gradient(circle at 12% 0%, rgba(227, 166, 75, 0.10), transparent 32rem),
            linear-gradient(160deg, #17110b 0%, #1c150e 55%, #17110b 100%);
        }
        .chalk-texture {
          background-image:
            radial-gradient(rgba(242, 232, 213, 0.05) 1px, transparent 1.4px),
            radial-gradient(rgba(242, 232, 213, 0.035) 1px, transparent 1.4px);
          background-size: 3px 3px, 7px 7px;
          background-position: 0 0, 2px 3px;
          mix-blend-mode: overlay;
        }
        .jeepney-stripe {
          background: repeating-linear-gradient(
            45deg,
            #c0472b 0px,
            #c0472b 14px,
            #f0b429 14px,
            #f0b429 28px,
            #2f8f7a 28px,
            #2f8f7a 42px,
            #f2e8d5 42px,
            #f2e8d5 56px
          );
        }
        .receipt-ticket {
          border-radius: 4px;
          clip-path: polygon(
            0% 3%, 4% 0%, 8% 3%, 12% 0%, 16% 3%, 20% 0%, 24% 3%, 28% 0%, 32% 3%, 36% 0%,
            40% 3%, 44% 0%, 48% 3%, 52% 0%, 56% 3%, 60% 0%, 64% 3%, 68% 0%, 72% 3%, 76% 0%,
            80% 3%, 84% 0%, 88% 3%, 92% 0%, 96% 3%, 100% 0%,
            100% 97%, 96% 100%, 92% 97%, 88% 100%, 84% 97%, 80% 100%, 76% 97%, 72% 100%,
            68% 97%, 64% 100%, 60% 97%, 56% 100%, 52% 97%, 48% 100%, 44% 97%, 40% 100%,
            36% 97%, 32% 100%, 28% 97%, 24% 100%, 20% 97%, 16% 100%, 12% 97%, 8% 100%,
            4% 97%, 0% 100%
          );
        }
      `}</style>
    </main>
  );
}
