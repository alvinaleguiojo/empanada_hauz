"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CalendarDays,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Flame,
  Minus,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  Star,
  Ticket,
  Truck,
  Wallet,
  X
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getProductRating, MENU_ITEMS } from "@/lib/menu";
import { useProductCatalog } from "@/components/products/product-catalog-provider";
const flavorOptions = MENU_ITEMS;
const deliveryMethods = [
  { label: "Pickup", value: "pickup" },
  { label: "Delivery", value: "maxim" }
];
const paymentMethods = [
  { label: "Cash on Delivery", value: "cod" },
  { label: "GCash", value: "gcash" }
];

type SelectedFlavor = { value: string; quantity: string };
type FormState = {
  deliveryDate: string;
  customerName: string;
  address: string;
  landmark: string;
  phoneNumber: string;
  paymentMethod: string;
  deliveryMethod: string;
  notes: string;
};
type PublicOrderResponse = { order: { id: string; orderNumber?: string }; trackingPath?: string };
type SuccessState = { orderNumber?: string; trackingPath: string; trackingUrl: string };
type OrderSummary = {
  items: Array<{ name: string; quantity: number; price: number; subtotal: number }>;
  totalQuantity: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
};

const initialState: FormState = {
  deliveryDate: "",
  customerName: "",
  address: "",
  landmark: "",
  phoneNumber: "",
  paymentMethod: "cod",
  deliveryMethod: "pickup",
  notes: ""
};

const steps = [
  { title: "Shop", subtitle: "Choose your flavors" },
  { title: "Details", subtitle: "Delivery & payment" },
  { title: "Review", subtitle: "Confirm your order" }
];

function formatProductTag(tag: string) {
  return tag
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function DesktopOrderSummary({
  step,
  summary,
  remaining,
  isStepValid,
  agreedToPolicy,
  submitting,
  summaryCopied,
  onCopy,
  onPrevious,
  onNext,
  onPlaceOrder
}: {
  step: number;
  summary: OrderSummary;
  remaining: number;
  isStepValid: boolean;
  agreedToPolicy: boolean;
  submitting: boolean;
  summaryCopied: boolean;
  onCopy: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onPlaceOrder: () => void;
}) {
  return (
    <aside className="hidden lg:block lg:sticky lg:top-[136px]">
      <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(160deg,rgba(17,26,43,0.98),rgba(10,16,28,0.98))] shadow-[0_28px_80px_-38px_rgba(0,0,0,0.95)]">
        <div className="border-b border-white/8 bg-white/[0.025] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-200/60">Live order</p><h3 className="mt-1 text-lg font-semibold tracking-tight text-white">Your selection</h3></div>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/45">{summary.totalQuantity} pcs</span>
          </div>
        </div>
        <div className="max-h-[310px] overflow-auto px-4 py-3 [scrollbar-width:thin]">
          {summary.items.length > 0 ? (
            <div className="space-y-1.5">
              {summary.items.map((item) => (
                <div key={item.name} className="rounded-xl border border-white/7 bg-white/[0.025] px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-white/82">{item.name}</p><p className="mt-0.5 text-[11px] text-white/35">{item.quantity} × Php {item.price}</p></div><span className="shrink-0 text-sm font-bold text-white/75">Php {item.subtotal}</span></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center"><ShoppingBag className="mx-auto text-white/20" size={28} /><p className="mt-3 text-sm font-semibold text-white/55">Your bag is empty</p><p className="mt-1 text-xs text-white/30">Select flavors to build your box.</p></div>
          )}
        </div>
        <div className="border-t border-white/8 px-5 py-4">
          {summary.totalQuantity < 10 ? (
            <div className="mb-4">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.15em] text-white/35"><span>Minimum order</span><span className="text-orange-200">{summary.totalQuantity}/10 pcs</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-[linear-gradient(90deg,#ff6337,#ffae68)] transition-all" style={{ width: ((Math.min(100, (summary.totalQuantity / 10) * 100)) + "%") }} /></div>
              <p className="mt-2 text-[11px] text-white/35">{remaining} more piece{remaining === 1 ? "" : "s"} to continue.</p>
            </div>
          ) : (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.06] px-3 py-2.5 text-xs font-semibold text-emerald-200"><CheckCircle2 size={14} /> Minimum order reached</div>
          )}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4 text-white/45"><span>Subtotal</span><span className="font-semibold text-white/75">Php {summary.subtotal}</span></div>
            {summary.deliveryFee > 0 ? <div className="flex justify-between gap-4 text-white/45"><span>Delivery estimate</span><span className="font-semibold text-white/75">Php {summary.deliveryFee}</span></div> : null}
            <div className="my-3 border-t border-dashed border-white/10" />
            <div className="flex items-end justify-between gap-4"><span className="text-xs font-bold uppercase tracking-[0.16em] text-white/40">Total</span><span className="text-2xl font-semibold tracking-tight text-white">Php {summary.total}</span></div>
          </div>
          <button type="button" onClick={onCopy} disabled={summary.items.length === 0} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] text-xs font-bold text-white/65 transition hover:bg-white/[0.07] disabled:opacity-30"><Copy size={14} /> {summaryCopied ? "Copied to clipboard" : "Copy order summary"}</button>
          <div className="mt-2 flex gap-2.5">
            <button type="button" onClick={onPrevious} disabled={step === 0} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-white/65 transition hover:bg-white/[0.07] disabled:opacity-20" aria-label="Previous step" data-gesture-prev><ArrowLeft size={17} /></button>
            {step < steps.length - 1 ? (
              <button type="button" onClick={onNext} disabled={!isStepValid} data-gesture-next className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#ff6337,#ff9154)] px-4 text-sm font-extrabold text-white shadow-[0_16px_30px_-18px_rgba(255,99,55,0.95)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-30">Continue <ArrowRight size={16} /></button>
            ) : (
              <button type="button" onClick={onPlaceOrder} disabled={submitting || !agreedToPolicy} data-gesture-next className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#ff6337,#ff9154)] px-4 text-sm font-extrabold text-white shadow-[0_16px_30px_-18px_rgba(255,99,55,0.95)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-30">{submitting ? "Placing order…" : "Place order"} <Check size={16} /></button>
            )}
          </div>
          {step === 2 && !agreedToPolicy ? <p className="mt-2 text-center text-[10px] leading-4 text-danger">Agree to the Privacy Policy to place your order.</p> : null}
        </div>
      </div>
    </aside>
  );
}

function CustomerKioskLoading({ stage }: { stage: "splash" | "skeleton" }) {
  if (stage === "splash") {
    return (
      <main className="kiosk-board flex min-h-screen items-center justify-center px-4 text-foreground">
        <div className="flex flex-col items-center text-center">
          <div className="grid h-28 w-28 place-items-center overflow-hidden rounded-[30px] border border-accent/25 bg-panel shadow-[0_20px_60px_-25px_rgb(var(--accent) / 0.9)]">
            <img
              src="/empanada hauz logo.jpg"
              alt="Empanada Hauz"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="mt-5 font-sans text-2xl font-extrabold text-foreground">
            Empanada Hauz
          </div>
          <div className="mt-1 font-sans text-lg text-foreground/55">
            Freshly made, your way.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="kiosk-board min-h-screen px-3 pb-8 pt-3 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        <header className="sticky top-0 z-40 -mx-3 border-b border-white/10 bg-[linear-gradient(180deg,rgba(8,13,24,0.97),rgba(8,13,24,0.82))] px-3 py-3 backdrop-blur-2xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent/15" />
              <div>
                <div className="h-4 w-32 rounded bg-[rgb(var(--foreground))]/10" />
                <div className="mt-2 h-3 w-24 rounded bg-[rgb(var(--foreground))]/5" />
              </div>
            </div>
            <div className="h-9 w-24 rounded-full bg-[rgb(var(--foreground))]/8" />
          </div>
        </header>

        <div className="sticky top-[67px] z-30 -mx-3 border-b border-line/10 bg-background/90 px-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex max-w-7xl gap-2.5 py-2.5">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-10 w-24 rounded-full bg-[rgb(var(--foreground))]/7" />
            ))}
          </div>
        </div>

        <section className="mt-0 overflow-hidden rounded-b-[30px] border-x border-b border-line/10 bg-panel">
          <div className="h-1.5 w-full bg-accent/15" />
          <div className="grid gap-8 px-5 py-7 sm:px-8 sm:py-8 lg:grid-cols-[1.25fr_0.75fr] lg:px-10 lg:py-10">
            <div>
              <div className="h-7 w-48 rounded-full bg-accent/10" />
              <div className="mt-5 h-12 w-full max-w-2xl rounded-xl bg-[rgb(var(--foreground))]/8 sm:h-16" />
              <div className="mt-3 h-5 w-5/6 max-w-2xl rounded bg-[rgb(var(--foreground))]/6" />
              <div className="mt-2 h-5 w-3/5 max-w-xl rounded bg-[rgb(var(--foreground))]/6" />
            </div>
            <div className="hidden lg:flex lg:items-end lg:justify-end">
              <div className="h-28 w-72 rounded-2xl bg-[rgb(var(--foreground))]/5" />
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[26px] border border-line/10 bg-panel p-4 sm:p-6">
          <div className="flex items-end justify-between gap-4 border-b border-line/10 pb-5">
            <div>
              <div className="h-3 w-20 rounded bg-accent/10" />
              <div className="mt-2 h-8 w-56 rounded bg-[rgb(var(--foreground))]/8" />
              <div className="mt-2 h-4 w-72 max-w-full rounded bg-[rgb(var(--foreground))]/5" />
            </div>
            <div className="hidden h-11 w-56 rounded-xl bg-[rgb(var(--foreground))]/7 sm:block" />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="overflow-hidden rounded-2xl border border-line/8 bg-panel">
                <div className="aspect-[16/9] bg-[rgb(var(--foreground))]/7" />
                <div className="p-4">
                  <div className="h-5 w-3/4 rounded bg-[rgb(var(--foreground))]/8" />
                  <div className="mt-2 h-3 w-full rounded bg-[rgb(var(--foreground))]/5" />
                  <div className="mt-2 h-3 w-2/3 rounded bg-[rgb(var(--foreground))]/5" />
                  <div className="mt-4 flex items-center gap-2">
                    <div className="h-7 w-16 rounded bg-accent/8" />
                    <div className="h-7 w-20 rounded-full bg-accent/8" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function ProductBadges({ option }: { option: (typeof MENU_ITEMS)[number] }) {
  const tags = Array.isArray(option.tags) ? option.tags.filter(Boolean) : [];
  const bestSeller = tags.some((tag) => {
    const normalized = tag.trim().toLowerCase();
    return normalized === "best-seller" || normalized === "bestseller";
  });
  const otherTags = tags.filter((tag) => {
    const normalized = tag.trim().toLowerCase();
    return normalized !== "best-seller" && normalized !== "bestseller";
  });

  if (!option.isFeatured && !option.isNew && !bestSeller && otherTags.length === 0) return null;

  return (
    <div className="mt-2 flex max-w-full flex-wrap gap-1.5">
      {bestSeller ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm">
          <Flame size={10} /> Best seller
        </span>
      ) : null}
      {option.isFeatured ? (
        <span className="rounded-full border border-accent/60 bg-panel/90 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-accent backdrop-blur">
          Featured
        </span>
      ) : null}
      {option.isNew ? (
        <span className="rounded-full border border-success/60 bg-panel/90 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-success backdrop-blur">
          New
        </span>
      ) : null}
      {otherTags.map((tag) => (
        <span key={`${option.value}-${tag}`} className="rounded-full border border-line/20 bg-panel/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/80 backdrop-blur">
          {formatProductTag(tag)}
        </span>
      ))}
    </div>
  );
}

export default function CustomerKioskPage() {
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedFlavors, setSelectedFlavors] = useState<SelectedFlavor[]>([]);
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [deliveryQuote, setDeliveryQuote] = useState<{ distanceKm: number | null; estimatedFare: number } | null>(null);
  const [quotingDelivery, setQuotingDelivery] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [loadingStage, setLoadingStage] = useState<"splash" | "skeleton">("splash");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const { status: catalogStatus } = useProductCatalog();

  useEffect(() => {
    const timer = window.setTimeout(() => setLoadingStage("skeleton"), 750);
    return () => window.clearTimeout(timer);
  }, []);

  const summary = useMemo(() => {
    const items = selectedFlavors.map((item) => {
      const flavor = flavorOptions.find((option) => option.value === item.value);
      if (!flavor) return null;
      const quantity = Math.max(0, Number(item.quantity || 0));
      if (quantity < 1) return null;
      return { name: flavor.value, quantity, price: flavor.price, subtotal: quantity * flavor.price };
    }).filter(Boolean) as Array<{ name: string; quantity: number; price: number; subtotal: number }>;

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const deliveryFee = form.deliveryMethod === "maxim" ? deliveryQuote?.estimatedFare ?? 0 : 0;
    return { items, totalQuantity, subtotal, deliveryFee, total: subtotal + deliveryFee } satisfies OrderSummary;
  }, [selectedFlavors, deliveryQuote, form.deliveryMethod]);

  const visibleFlavorOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return flavorOptions;
    return flavorOptions.filter((option) =>
      option.label.toLowerCase().includes(query) ||
      option.category.toLowerCase().includes(query) ||
      option.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [search]);

  const allFlavorsSelected = flavorOptions.length > 0 && flavorOptions.filter((option) => option.available !== false).every((option) => selectedFlavors.some((item) => item.value === option.value));
  const todayDateString = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const leadingDays = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<string | null> = Array.from({ length: leadingDays }, () => null);

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }

    return cells;
  }, [calendarMonth]);

  const calendarMonthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthKey = todayDateString.slice(0, 7);
  const canGoPreviousMonth = calendarMonthKey > currentMonthKey;
  const selectedDateLabel = form.deliveryDate
    ? new Date(`${form.deliveryDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : "Choose a future date";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ref")?.trim();
    if (code) {
      window.localStorage.setItem("empanada-referral-code", code);
      setReferralCode(code);
    } else {
      setReferralCode(window.localStorage.getItem("empanada-referral-code") ?? "");
    }
  }, []);
  const handleChange = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "address" || key === "landmark") setDeliveryQuote(null);
  };

  const quoteDelivery = () => {
    const address = form.address.trim();
    if (form.deliveryMethod !== "maxim" || address.length < 5) {
      setDeliveryQuote(null);
      setQuotingDelivery(false);
      return;
    }

    setQuotingDelivery(true);
    const params = new URLSearchParams({ address });
    if (form.landmark.trim()) params.set("landmark", form.landmark.trim());

    void apiFetch<{ distanceKm: number | null; estimatedFare: number }>(`/orders/delivery-quote?${params.toString()}`)
      .then((quote) => setDeliveryQuote(quote))
      .catch(() => setDeliveryQuote(null))
      .finally(() => setQuotingDelivery(false));
  };

  const toggleFlavor = (value: string) => {
    const option = flavorOptions.find((item) => item.value === value);
    if (!option || option.available === false) return;
    setSelectedFlavors((current) => {
      const existing = current.find((item) => item.value === value);
      return existing ? current.filter((item) => item.value !== value) : [...current, { value, quantity: "1" }];
    });
  };

  const toggleAllFlavors = () => {
    setSelectedFlavors((current) => allFlavorsSelected
      ? []
      : flavorOptions.filter((option) => option.available !== false).map((option) => current.find((item) => item.value === option.value) ?? { value: option.value, quantity: "1" }));
  };

  const updateFlavorQuantity = (value: string, quantity: string) => {
    const normalized = quantity.replace(/[^\d]/g, "");
    setSelectedFlavors((current) => current.map((item) => item.value === value ? { ...item, quantity: normalized } : item));
  };

  const stepFlavorQuantity = (value: string, delta: number) => {
    setSelectedFlavors((current) => current.map((item) => {
      if (item.value !== value) return item;
      return { ...item, quantity: String(Math.max(1, Number(item.quantity || 0) + delta)) };
    }));
  };

  const copyOrderSummary = async () => {
    const paymentLabel = paymentMethods.find((method) => method.value === form.paymentMethod)?.label ?? form.paymentMethod;
    const deliveryLabel = deliveryMethods.find((method) => method.value === form.deliveryMethod)?.label ?? form.deliveryMethod;
    const customerName = form.customerName.trim();
    const phoneNumber = form.phoneNumber.trim();
    const preferredDate = form.deliveryDate.trim();
    const address = form.address.trim();
    const landmark = form.landmark.trim();
    const notes = form.notes.trim();

    const lines = [
      "🥟 EMPANADA HAUZ ORDER",
      "",
      "Order Items",
      ...summary.items.map((item) => `• ${item.name} — ${item.quantity} pc${item.quantity === 1 ? "" : "s"} × ₱${item.price} = ₱${item.subtotal}`),
      "",
      `📦 Total Pieces: ${summary.totalQuantity} pcs`,
      `💰 Subtotal: ₱${summary.subtotal}`,
      ...(form.deliveryMethod === "maxim" ? [`🚚 Delivery: ${summary.deliveryFee ? `₱${summary.deliveryFee}` : "Pending estimate"}`] : []),
      `💵 TOTAL: ₱${summary.total}`,
      "",
      "Customer Details",
      ...(customerName ? [`👤 Name: ${customerName}`] : []),
      ...(phoneNumber ? [`📱 Phone: ${phoneNumber}`] : []),
      `🚚 Delivery: ${deliveryLabel}`,
      `💳 Payment: ${paymentLabel}`,
      ...(preferredDate ? [`📅 Preferred Date: ${preferredDate}`] : []),
      ...(address ? [`📍 Address: ${address}`] : []),
      ...(landmark ? [`🗺️ Landmark: ${landmark}`] : []),
      ...(notes ? [`📝 Notes: ${notes}`] : []),
      "",
      "Please review the details above before placing the order. 😊"
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setSummaryCopied(true);
      window.setTimeout(() => setSummaryCopied(false), 1800);
    } catch {
      setError("Unable to copy the order summary. Please try again.");
    }
  };

  const isStepValid = step === 0 ? summary.items.length > 0 && summary.totalQuantity >= 10 : true;

  useEffect(() => {
    if (form.deliveryMethod !== "maxim" || form.address.trim().length < 5) {
      setDeliveryQuote(null);
      setQuotingDelivery(false);
      return;
    }
    const timer = window.setTimeout(() => quoteDelivery(), 500);
    return () => window.clearTimeout(timer);
  }, [form.deliveryMethod, form.address, form.landmark]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (summary.items.length === 0) return setError("Please select at least one flavor.");
    if (summary.totalQuantity < 10) return setError("Minimum order is 10 pieces. Please increase the quantity.");
    if (form.customerName.trim().length < 2) return setError("Please enter your full name.");
    if (form.phoneNumber.replace(/\D/g, "").length < 7) return setError("Please enter a valid contact number.");
    if (form.deliveryMethod === "maxim" && form.address.trim().length < 2) return setError("Please enter your complete delivery address.");
    if (!agreedToPolicy) return setError("Please agree to the Privacy Policy before placing your order.");

    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const preferredSchedule = form.deliveryDate ? `${form.deliveryDate}T12:00:00+08:00` : undefined;
      const result = await apiFetch<PublicOrderResponse>("/orders/public", {
        method: "POST",
        body: JSON.stringify({
          customerName: form.customerName,
          phoneNumber: form.phoneNumber,
          address: form.address.trim(),
          landmark: form.landmark.trim() || undefined,
          quantity: summary.totalQuantity,
          unitPrice: 0,
          deliveryMethod: form.deliveryMethod,
          paymentMethod: form.paymentMethod,
          preferredSchedule,
          items: summary.items,
          notes: form.notes.trim() || undefined,
          referralCode: referralCode || undefined
        })
      });
      const trackingPath = result.trackingPath ?? `/track/${result.order.id}`;
      const origin = typeof window === "undefined" ? "" : window.location.origin;
      setSuccess({ orderNumber: result.order.orderNumber, trackingPath, trackingUrl: `${origin}${trackingPath}` });
      setSelectedFlavors([]);
      setForm(initialState);
      setDeliveryQuote(null);
      setAgreedToPolicy(false);
      setBagOpen(false);
      setStep(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to place order");
    } finally {
      setSubmitting(false);
    }
  };

  const remaining = Math.max(0, 10 - summary.totalQuantity);
  const handleStartNewOrder = () => { setSuccess(null); setError(null); };

  if (catalogStatus === "loading") {
    return <CustomerKioskLoading stage={loadingStage} />;
  }

  if (catalogStatus === "error") {
    return (
      <main className="kiosk-board flex min-h-screen items-center justify-center px-4 text-foreground">
        <div className="max-w-sm rounded-2xl border border-danger/30 bg-panel px-6 py-5 text-center shadow-xl">
          <p className="text-sm font-semibold">We couldn’t load the menu right now.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white">Try again</button>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="kiosk-board flex min-h-screen items-center justify-center px-4 py-10 text-foreground sm:px-6">
        <div className="w-full max-w-lg">
          <div className="overflow-hidden rounded-[28px] border border-line/10 bg-panel/95 shadow-[0_30px_80px_-28px_rgba(0,0,0,0.8)] backdrop-blur">
            <div className="jeepney-stripe h-2 w-full" />
            <div className="p-7 sm:p-10">
              <div className="flex flex-col items-center text-center">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-success text-foreground shadow-[0_10px_30px_-12px_rgb(var(--success) / 0.8)]"><CheckCircle2 size={32} /></span>
                <span className="mt-5 rounded-full border border-success/30 bg-success/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-success">Order confirmed</span>
                <h1 className="mt-4 font-sans text-4xl text-foreground">Thank you!</h1>
                <p className="mt-1 font-sans text-xl text-foreground/65">salamat po — we're on it</p>
                {success.orderNumber ? <p className="mt-5 rounded-xl border border-dashed border-line/20 bg-background px-4 py-2 font-mono text-sm text-foreground/75">Order {success.orderNumber}</p> : null}
                <p className="mt-5 max-w-sm text-sm leading-6 text-foreground/60">Keep your tracking link handy so you can check your order status anytime.</p>
                <div className="mt-5 grid w-full gap-2.5">
                  <input readOnly value={success.trackingUrl} className="w-full min-w-0 rounded-xl border border-line/10 bg-background px-4 py-3 text-center font-mono text-xs text-foreground/75 outline-none" />
                  <div className="grid grid-cols-2 gap-2.5">
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(success.trackingUrl)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-line/10 bg-panel px-3 py-3 font-semibold text-foreground transition hover:bg-white/[0.08]"><Copy size={15} /> Copy</button>
                    <a href={success.trackingPath} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-3 py-3 font-semibold text-foreground transition hover:bg-accent/90">Track order <ExternalLink size={15} /></a>
                  </div>
                </div>
                <button type="button" onClick={handleStartNewOrder} className="mt-6 w-full rounded-xl bg-accent px-5 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-foreground shadow-[0_10px_28px_-14px_rgb(var(--accent) / 0.9)] transition hover:bg-[#ff8a4d]">Place another order</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const stepNavigation = (
    <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Order steps">
      {steps.map((item, index) => {
        const active = index === step;
        const complete = index < step;
        return (
          <button
            key={item.title}
            type="button"
            onClick={() => complete && setStep(index)}
            disabled={!complete && !active}
            className={`group flex min-w-[148px] shrink-0 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition sm:min-w-[175px] ${active ? "border-orange-300/25 bg-orange-300/[0.08] shadow-[0_12px_35px_-24px_rgba(255,99,55,0.9)]" : complete ? "border-emerald-300/15 bg-emerald-300/[0.05]" : "border-white/7 bg-white/[0.025]"}`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[11px] font-extrabold ${active ? "bg-[linear-gradient(135deg,#ff6337,#ff9154)] text-white" : complete ? "bg-emerald-300 text-[#062018]" : "bg-white/[0.07] text-white/35"}`}>
              {complete ? <Check size={14} /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className={`block text-[12px] font-bold ${active ? "text-white" : complete ? "text-emerald-200" : "text-white/35"}`}>{item.title}</span>
              <span className="mt-0.5 block truncate text-[10px] text-white/25">{item.subtitle}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <main className="kiosk-board min-h-screen px-3 pb-8 pt-3 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="sticky top-0 z-40 -mx-3 border-b border-line/10 bg-background/95 px-3 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] shadow-[0_10px_35px_-18px_rgba(255,99,55,0.85)]"><img src="/empanada hauz logo.jpg" alt="Empanada Hauz" className="h-full w-full object-cover" /></div>
              <div className="min-w-0">
                <div className="font-sans text-base font-extrabold leading-none tracking-tight text-white">Empanada Hauz</div>
                <div className="mt-1 truncate text-[11px] font-medium text-white/40">Freshly made, your way.</div>
              </div>
            </div>
            <button type="button" onClick={() => setBagOpen(true)} aria-label={`Open bag with ${summary.totalQuantity} pieces`} className="inline-flex items-center gap-2 rounded-full border border-line/10 bg-panel px-3 py-2 transition hover:border-accent/30 hover:bg-panel">
              <ShoppingBag size={15} className="text-accent" />
              <span className="font-mono text-xs font-semibold text-foreground">{summary.totalQuantity} pcs</span>
              <span className="hidden text-foreground/30 sm:inline">·</span>
              <span className="hidden font-mono text-xs font-semibold text-accent sm:inline">Php {summary.total}</span>
            </button>
          </div>
        </header>

        <div className="sticky top-[67px] z-30 -mx-3 border-b border-line/10 bg-background/90 px-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 lg:top-[68px]">
          {stepNavigation}
        </div>

        <section className="mt-0 overflow-hidden rounded-b-[32px] border-x border-b border-white/8 bg-[radial-gradient(circle_at_88%_15%,rgba(255,117,67,0.22),transparent_28%),radial-gradient(circle_at_74%_70%,rgba(59,214,255,0.08),transparent_26%),linear-gradient(145deg,#0b1220,#121b2d_62%,#17243a)] shadow-[0_35px_100px_-42px_rgba(0,0,0,0.95)]">
          <div className="h-1.5 w-full bg-[linear-gradient(90deg,#ff6337,#ff9f5b,#48d9ff)]" />
          <div className="grid gap-8 px-5 py-8 sm:px-8 sm:py-9 lg:grid-cols-[minmax(0,1.2fr)_360px] lg:px-10 lg:py-11">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-orange-200">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-300 shadow-[0_0_12px_rgba(255,174,120,0.75)]" />
                Made to order
                <span className="text-white/20">•</span>
                10 pcs minimum
              </div>
              <h1 className="mt-4 max-w-3xl font-sans text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">Build your perfect box.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">Pick your flavors, set the quantity, choose pickup or delivery, and review everything before you place your order.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/60">Freshly made</span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/60">Pickup & delivery</span>
                <Link href="/delivery-fee" className="rounded-full border border-orange-300/15 bg-orange-300/10 px-3 py-1.5 text-[11px] font-bold text-orange-200 transition hover:bg-orange-300/15">Check delivery fee</Link>
              </div>
            </div>
            <div className="relative hidden min-h-[190px] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] lg:block">
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-orange-400/20 blur-3xl" />
              <div className="absolute -bottom-10 -left-6 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />
              <div className="relative flex h-full flex-col justify-between p-5">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]"><img src="/empanada hauz logo.jpg" alt="" className="h-full w-full object-cover" /></div>
                  <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-white/35">Empanada Hauz</p><p className="mt-1 text-sm font-semibold text-white/80">Made fresh for your order</p></div>
                </div>
                <div><p className="font-sans text-2xl font-semibold tracking-tight text-white/85">Choose. Build. Enjoy.</p><p className="mt-1 text-xs text-white/35">Your order stays visible every step.</p></div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <form id="kiosk-order-form" onSubmit={handleSubmit}>
          <section className="min-w-0 rounded-[26px] border border-white/8 bg-white/[0.025] p-4 shadow-[0_28px_70px_-44px_rgba(0,0,0,0.9)] sm:p-6">
            {step === 0 ? (
              <>
                <div className="flex flex-col gap-4 border-b border-line/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Step 1 · shop</p>
                    <h2 className="mt-1.5 font-sans text-2xl font-extrabold text-foreground sm:text-3xl">Choose your flavors</h2>
                    <p className="mt-1 text-sm text-foreground/50">Tap a flavor to add it. Then adjust your quantity.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="relative block min-w-0 flex-1 sm:w-56 sm:flex-none">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" />
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search flavors" className="w-full rounded-xl border border-line/10 bg-background py-2.5 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-foreground/30 focus:border-accent/50" />
                    </label>
                    <button type="button" onClick={toggleAllFlavors} className="shrink-0 rounded-xl border border-accent/25 bg-accent/8 px-3 py-2.5 text-xs font-bold text-accent transition hover:bg-accent/12">{allFlavorsSelected ? "Clear" : "Select all"}</button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleFlavorOptions.length > 0 ? visibleFlavorOptions.map((option) => {
                    const selected = selectedFlavors.find((item) => item.value === option.value);
                    const soldOut = option.available === false;
                    const rating = getProductRating(option.value);
                    return (
                      <article key={option.value} className={`group relative overflow-hidden rounded-[22px] border bg-white/[0.025] transition duration-300 ${selected ? "border-accent/70 bg-accent/[0.055] shadow-[0_24px_55px_-28px_rgba(255,99,55,0.75)] -translate-y-0.5" : "border-white/8 hover:-translate-y-1 hover:border-white/15 hover:bg-white/[0.045]"} ${soldOut ? "opacity-55" : ""}`}>
                        <button
                          type="button"
                          onClick={() => toggleFlavor(option.value)}
                          disabled={soldOut}
                          aria-label={soldOut ? `${option.label} is sold out` : `${selected ? "Remove" : "Select"} ${option.label}`}
                          className="relative block aspect-[16/9] w-full overflow-hidden bg-[#0c1422] text-left disabled:cursor-not-allowed"
                        >
                          {option.imageUrl ? <img src={option.imageUrl} alt="" loading="lazy" decoding="async" fetchPriority="low" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_30%,rgb(var(--accent) / 0.18),transparent_60%)]"><span className="font-sans text-4xl text-accent/55">EH</span></div>}
                          <div className="absolute inset-0 bg-gradient-to-t from-[rgb(var(--background))] via-transparent to-transparent" />
                          {soldOut ? <span className="absolute bottom-3 left-3 rounded-full bg-background/85 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/65">Sold out</span> : null}
                          {selected ? <span className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-accent text-foreground shadow-lg"><Check size={16} /></span> : null}
                        </button>
                        <div className="p-4">
                          <button type="button" onClick={() => toggleFlavor(option.value)} disabled={soldOut} className="w-full text-left disabled:cursor-not-allowed">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="font-sans text-lg font-extrabold text-foreground">{option.value}</h3>
                                <ProductBadges option={option} />
                                {option.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-foreground/45">{option.description}</p> : null}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <div className="font-mono text-sm font-semibold text-accent">Php {option.price}</div>
                                  {rating ? (
                                    <div className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/8 px-2 py-1 text-[10px] font-bold text-accent">
                                      <Star size={11} fill="currentColor" />
                                      <span>{rating.ratingValue.toFixed(1)}</span>
                                      <span className="font-normal text-foreground/45">({rating.reviewCount})</span>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </button>
                          {selected ? <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2 border-t border-line/8 pt-3"><div className="grid h-11 grid-cols-[38px_minmax(0,1fr)_38px] overflow-hidden rounded-xl border border-line/10 bg-background"><button type="button" aria-label={`Decrease ${option.label}`} onClick={() => stepFlavorQuantity(option.value, -1)} className="flex items-center justify-center border-r border-line/10 text-accent transition hover:bg-accent/8"><Minus size={15} /></button><input type="text" inputMode="numeric" pattern="[0-9]*" aria-label={`${option.label} quantity`} value={selected.quantity} onChange={(event) => updateFlavorQuantity(option.value, event.target.value)} onFocus={(event) => event.currentTarget.select()} className="h-full min-w-0 bg-transparent text-center font-mono text-sm font-bold text-foreground outline-none" /><button type="button" aria-label={`Increase ${option.label}`} onClick={() => stepFlavorQuantity(option.value, 1)} className="flex items-center justify-center border-l border-line/10 text-accent transition hover:bg-accent/8"><Plus size={15} /></button></div><button type="button" aria-label={`Add 5 ${option.label}`} onClick={() => stepFlavorQuantity(option.value, 5)} className="h-11 rounded-xl border border-accent/20 bg-accent/8 px-3 font-mono text-[11px] font-bold text-accent">+5</button></div> : null}
                        </div>
                      </article>
                    );
                  }) : <div className="col-span-full rounded-2xl border border-dashed border-line/10 bg-background p-10 text-center"><Search className="mx-auto text-foreground/25" size={25} /><p className="mt-3 font-semibold text-foreground/55">No flavors match “{search}”.</p><button type="button" onClick={() => setSearch("")} className="mt-2 text-xs font-bold text-accent">Clear search</button></div>}
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <div className="space-y-5">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Step 2 · details</p>
                  <h2 className="mt-1.5 font-sans text-2xl font-extrabold text-foreground sm:text-3xl">How should we get it to you?</h2>
                  <p className="mt-1 text-sm text-foreground/50">Pick your delivery method, payment, and preferred date.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="rounded-2xl border border-line/8 bg-panel p-4"><span className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-foreground/55"><Truck size={14} className="text-accent" /> Delivery method</span><div className="grid grid-cols-2 gap-2">{deliveryMethods.map((option) => <button key={option.value} type="button" onClick={() => { handleChange("deliveryMethod", option.value); if (option.value !== "maxim") setDeliveryQuote(null); }} className={`min-h-12 rounded-xl border px-3 text-sm font-bold transition ${form.deliveryMethod === option.value ? "border-accent/60 bg-accent/12 text-accent" : "border-line/10 bg-background text-foreground/60"}`}>{option.label}</button>)}</div></label>
                  <label className="rounded-2xl border border-line/8 bg-panel p-4"><span className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-foreground/55"><Wallet size={14} className="text-accent" /> Payment</span><div className="grid grid-cols-2 gap-2">{paymentMethods.map((option) => <button key={option.value} type="button" onClick={() => handleChange("paymentMethod", option.value)} className={`min-h-12 rounded-xl border px-3 text-sm font-bold transition ${form.paymentMethod === option.value ? "border-accent/60 bg-accent/12 text-accent" : "border-line/10 bg-background text-foreground/60"}`}>{option.label}</button>)}</div></label>
                  <label className="rounded-2xl border border-line/8 bg-panel p-4 sm:col-span-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-foreground/55"><CalendarDays size={14} className="text-accent" /> Preferred date</span>
                        <p className="mt-1 text-sm font-semibold text-foreground">{selectedDateLabel}</p>
                      </div>
                      <button type="button" onClick={() => { const today = new Date(); setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1)); handleChange("deliveryDate", todayDateString); }} className="self-start rounded-lg border border-accent/20 bg-accent/8 px-3 py-2 text-xs font-bold text-accent transition hover:bg-accent/12 sm:self-auto">Today</button>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-line/8 bg-background">
                      <div className="flex items-center justify-between gap-3 border-b border-line/8 px-3 py-3 sm:px-4">
                        <button type="button" aria-label="Previous month" disabled={!canGoPreviousMonth} onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-line/10 text-foreground/65 transition hover:border-accent/30 hover:text-accent disabled:cursor-not-allowed disabled:opacity-25"><ChevronLeft size={17} /></button>
                        <div className="text-center">
                          <div className="font-sans text-sm font-extrabold text-foreground sm:text-base">{calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
                          <p className="mt-0.5 text-[10px] text-foreground/40">Future dates are available</p>
                        </div>
                        <button type="button" aria-label="Next month" onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-line/10 text-foreground/65 transition hover:border-accent/30 hover:text-accent"><ChevronRight size={17} /></button>
                      </div>
                      <div className="grid grid-cols-7 gap-1 px-2 pb-2 pt-3 sm:gap-1.5 sm:px-3">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} className="pb-1 text-center text-[10px] font-bold uppercase tracking-wider text-foreground/35">{day}</span>)}
                        {calendarDays.map((value, index) => {
                          if (!value) return <span key={`empty-${index}`} aria-hidden="true" className="aspect-square" />;
                          const isPast = value < todayDateString;
                          const isSelected = form.deliveryDate === value;
                          const isToday = value === todayDateString;
                          return (
                            <button
                              key={value}
                              type="button"
                              disabled={isPast}
                              onClick={() => handleChange("deliveryDate", value)}
                              className={`aspect-square rounded-xl border text-sm font-bold transition ${isSelected ? "border-accent/70 bg-accent text-white shadow-[0_8px_20px_-12px_rgb(var(--accent) / 0.9)]" : isPast ? "cursor-not-allowed border-transparent text-foreground/15" : isToday ? "border-accent/35 bg-accent/8 text-accent hover:border-accent/60 hover:bg-accent/12" : "border-transparent text-foreground/70 hover:border-line/15 hover:bg-panel hover:text-foreground"}`}
                              aria-label={new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                            >
                              {Number(value.slice(-2))}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-5">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Step 3 · review</p>
                  <h2 className="mt-1.5 font-sans text-2xl font-extrabold text-foreground sm:text-3xl">Almost there.</h2>
                  <p className="mt-1 text-sm text-foreground/50">Add your contact and delivery details, then place your order.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input placeholder="Full name" value={form.customerName} onChange={(event) => handleChange("customerName", event.target.value)} className="rounded-xl border border-line/30 bg-panel px-4 py-3.5 text-sm text-foreground outline-none placeholder:text-foreground/40 transition focus:border-accent/80 focus:ring-2 focus:ring-accent/15" required />
                  <input placeholder="Contact number" value={form.phoneNumber} onChange={(event) => handleChange("phoneNumber", event.target.value)} className="rounded-xl border border-line/30 bg-panel px-4 py-3.5 text-sm text-foreground outline-none placeholder:text-foreground/40 transition focus:border-accent/80 focus:ring-2 focus:ring-accent/15" required />
                  <input placeholder={form.deliveryMethod === "maxim" ? "Complete delivery address" : "Address"} value={form.address} onChange={(event) => handleChange("address", event.target.value)} onBlur={quoteDelivery} className="rounded-xl border border-line/30 bg-panel px-4 py-3.5 text-sm text-foreground outline-none placeholder:text-foreground/40 transition focus:border-accent/80 focus:ring-2 focus:ring-accent/15 sm:col-span-2" required />
                  <input placeholder="Landmark / nearby place" value={form.landmark} onChange={(event) => handleChange("landmark", event.target.value)} onBlur={quoteDelivery} className="rounded-xl border border-line/30 bg-panel px-4 py-3.5 text-sm text-foreground outline-none placeholder:text-foreground/40 transition focus:border-accent/80 focus:ring-2 focus:ring-accent/15 sm:col-span-2" required />
                  <textarea placeholder="Optional note for us" value={form.notes} onChange={(event) => handleChange("notes", event.target.value)} className="min-h-[110px] rounded-xl border border-line/30 bg-panel px-4 py-3.5 text-sm text-foreground outline-none placeholder:text-foreground/40 transition focus:border-accent/80 focus:ring-2 focus:ring-accent/15 sm:col-span-2" />
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line/20 bg-panel p-4 transition hover:border-line/30"><input type="checkbox" checked={agreedToPolicy} onChange={(event) => setAgreedToPolicy(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--accent))]" /><span className="text-sm leading-6 text-foreground/65">I agree that Empanada Hauz may collect and use my name, contact number, and address to process and deliver this order, as described in the <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-2">Privacy Policy</a>.</span></label>
              </div>
            ) : null}

            {error ? <p className="mt-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}
          </section>
          </form>
          <DesktopOrderSummary
            step={step}
            summary={summary}
            remaining={remaining}
            isStepValid={isStepValid}
            agreedToPolicy={agreedToPolicy}
            submitting={submitting}
            summaryCopied={summaryCopied}
            onCopy={() => void copyOrderSummary()}
            onPrevious={() => setStep((current) => Math.max(0, current - 1))}
            onNext={() => { setStep((current) => current + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            onPlaceOrder={() => { window.requestAnimationFrame(() => (document.getElementById("kiosk-order-form") as HTMLFormElement | null)?.requestSubmit()); }}
          />
        </div>

        <p className="py-5 text-center font-sans text-sm text-white/25">made fresh daily by Empanada Hauz</p>
      </div>

      {bagOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close bag" onClick={() => setBagOpen(false)} className="absolute inset-0 bg-background/65 backdrop-blur-[2px]" />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-panel text-foreground shadow-[-24px_0_80px_-40px_rgba(0,0,0,0.85)]">
            <div className="flex items-center justify-between border-b border-dashed border-line/15 px-5 py-5 sm:px-6">
              <div>
                <div className="flex items-center gap-2 font-sans text-sm font-extrabold uppercase tracking-[0.16em]"><ShoppingBag size={17} /> Your bag</div>
                <p className="mt-1.5 text-xs text-foreground/45">Your selections update live.</p>
              </div>
              <button type="button" onClick={() => setBagOpen(false)} aria-label="Close bag" className="grid h-10 w-10 place-items-center rounded-full border border-line/10 bg-panel/5 transition hover:bg-panel/10"><X size={18} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4 sm:px-6">
              {summary.items.length > 0 ? summary.items.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3 border-b border-line/7 py-3 first:pt-0 last:border-b-0"><div className="min-w-0"><div className="truncate text-sm font-bold">{item.name}</div><div className="mt-0.5 font-mono text-[11px] text-foreground/45">{item.quantity} × Php {item.price}</div></div><div className="shrink-0 font-mono text-sm font-bold">Php {item.subtotal}</div></div>
              )) : <div className="py-16 text-center"><ShoppingBag className="mx-auto text-foreground/20" size={30} /><p className="mt-3 text-sm font-semibold text-foreground/45">Your bag is empty.</p><p className="mt-1 text-xs text-foreground/35">Pick a flavor to get started.</p></div>}
            </div>
            <div className="border-t border-dashed border-line/15 px-5 py-5 sm:px-6">
              {form.deliveryMethod === "maxim" && form.address.trim() ? <div className="mb-3 flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-1.5 text-foreground/55"><Truck size={14} /> {quotingDelivery ? "Estimating delivery…" : "Est. delivery"}{!quotingDelivery && deliveryQuote?.distanceKm != null ? ` · ${deliveryQuote.distanceKm.toFixed(1)} km` : ""}</span><span className="font-mono font-bold">{quotingDelivery ? "…" : deliveryQuote ? `Php ${deliveryQuote.estimatedFare}` : "—"}</span></div> : null}
              <div className="flex items-end justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/45">Total</div><div className="mt-1 font-mono text-2xl font-bold">Php {summary.total}</div></div><div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${summary.totalQuantity >= 10 ? "bg-success/15 text-success" : "bg-danger/10 text-danger"}`}>{summary.totalQuantity >= 10 ? "Minimum reached" : `${remaining} pcs to go`}</div></div>
              {form.deliveryMethod === "maxim" ? <p className="mt-2 text-[10px] leading-4 text-foreground/40">Delivery total uses an estimate until our team confirms the final fare.</p> : null}
              <div className="mt-4 grid gap-2">
                <button type="button" onClick={() => void copyOrderSummary()} disabled={summary.items.length === 0} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line/12 bg-panel/4 px-4 text-sm font-bold text-foreground transition hover:bg-panel/8 disabled:cursor-not-allowed disabled:opacity-35"><Copy size={16} /> {summaryCopied ? "Copied!" : "Copy summary"}</button>
                <div className="flex gap-2.5">
                  <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} data-gesture-prev className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line/12 bg-panel/4 text-foreground disabled:cursor-not-allowed disabled:opacity-25"><ArrowLeft size={17} /></button>
                  {step < steps.length - 1 ? <button type="button" onClick={() => { setStep((current) => current + 1); setBagOpen(false); }} disabled={!isStepValid} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-extrabold uppercase tracking-[0.06em] text-white shadow-[0_10px_26px_-15px_rgba(192,71,43,0.95)] transition hover:bg-[#ff8a4d] disabled:cursor-not-allowed disabled:opacity-35" data-gesture-next>Continue <ArrowRight size={16} /></button> : <button type="submit" form="kiosk-order-form" disabled={submitting || !agreedToPolicy} onClick={() => setBagOpen(false)} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-extrabold uppercase tracking-[0.06em] text-white shadow-[0_10px_26px_-15px_rgba(192,71,43,0.95)] transition hover:bg-[#ff8a4d] disabled:cursor-not-allowed disabled:opacity-35" data-gesture-next>{submitting ? "Placing order…" : "Place order"} <Check size={16} /></button>}
                </div>
                {step === 0 && summary.totalQuantity < 10 ? <p className="text-center font-sans text-sm text-danger">add {remaining} more piece{remaining === 1 ? "" : "s"} po</p> : null}
                {step === 2 && !agreedToPolicy ? <p className="text-center font-sans text-sm text-danger">please agree to the Privacy Policy to continue</p> : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      <style jsx global>{`.kiosk-board{background:radial-gradient(circle at 10% 0%,rgba(255,99,55,0.16),transparent 28rem),radial-gradient(circle at 88% 12%,rgba(56,214,255,0.08),transparent 26rem),linear-gradient(145deg,#07101d 0%,#0c1422 44%,#111b2d 100%)} .jeepney-stripe{background:linear-gradient(135deg,rgb(var(--accent)),#ff8a4d)} .line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}`}</style>
    </main>
  );
}
