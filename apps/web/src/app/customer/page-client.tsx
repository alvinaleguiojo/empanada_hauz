"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Baloo_2, Caveat, IBM_Plex_Mono } from "next/font/google";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChefHat,
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
import dynamic from "next/dynamic";

const display = Baloo_2({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const script = Caveat({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-script" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-mono" });

const GestureOrdering = dynamic(() => import("@/components/customer/gesture-ordering"), {
  ssr: false,
  loading: () => null,
});

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

function CustomerKioskLoading({ stage }: { stage: "splash" | "skeleton" }) {
  if (stage === "splash") {
    return (
      <main className="kiosk-board flex min-h-screen items-center justify-center px-4 text-[#F2E8D5]">
        <div className="flex flex-col items-center text-center">
          <div className="grid h-28 w-28 place-items-center overflow-hidden rounded-[30px] border border-[#E3A64B]/25 bg-[#241c13] shadow-[0_20px_60px_-25px_rgba(227,166,75,0.9)]">
            <img
              src="/empanada hauz logo.jpg"
              alt="Empanada Hauz"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="mt-5 font-[family-name:var(--font-display)] text-2xl font-extrabold text-[#F6EFDD]">
            Empanada Hauz
          </div>
          <div className="mt-1 font-[family-name:var(--font-script)] text-lg text-[#F2E8D5]/55">
            Freshly made, your way.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="kiosk-board min-h-screen px-3 pb-8 pt-3 text-[#F2E8D5] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        <header className="sticky top-0 z-40 -mx-3 border-b border-[#F2E8D5]/10 bg-[#17110b]/95 px-3 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#E3A64B]/15" />
              <div>
                <div className="h-4 w-32 rounded bg-[#F2E8D5]/10" />
                <div className="mt-2 h-3 w-24 rounded bg-[#F2E8D5]/5" />
              </div>
            </div>
            <div className="h-9 w-24 rounded-full bg-[#F2E8D5]/8" />
          </div>
        </header>

        <div className="sticky top-[67px] z-30 -mx-3 border-b border-[#F2E8D5]/10 bg-[#17110b]/90 px-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex max-w-7xl gap-2.5 py-2.5">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-10 w-24 rounded-full bg-[#F2E8D5]/7" />
            ))}
          </div>
        </div>

        <section className="mt-0 overflow-hidden rounded-b-[30px] border-x border-b border-[#F2E8D5]/10 bg-[#241c13]">
          <div className="h-1.5 w-full bg-[#E3A64B]/15" />
          <div className="grid gap-8 px-5 py-7 sm:px-8 sm:py-8 lg:grid-cols-[1.25fr_0.75fr] lg:px-10 lg:py-10">
            <div>
              <div className="h-7 w-48 rounded-full bg-[#E3A64B]/10" />
              <div className="mt-5 h-12 w-full max-w-2xl rounded-xl bg-[#F2E8D5]/8 sm:h-16" />
              <div className="mt-3 h-5 w-5/6 max-w-2xl rounded bg-[#F2E8D5]/6" />
              <div className="mt-2 h-5 w-3/5 max-w-xl rounded bg-[#F2E8D5]/6" />
            </div>
            <div className="hidden lg:flex lg:items-end lg:justify-end">
              <div className="h-28 w-72 rounded-2xl bg-[#F2E8D5]/5" />
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[26px] border border-[#F2E8D5]/10 bg-[#20180f] p-4 sm:p-6">
          <div className="flex items-end justify-between gap-4 border-b border-[#F2E8D5]/10 pb-5">
            <div>
              <div className="h-3 w-20 rounded bg-[#E3A64B]/10" />
              <div className="mt-2 h-8 w-56 rounded bg-[#F2E8D5]/8" />
              <div className="mt-2 h-4 w-72 max-w-full rounded bg-[#F2E8D5]/5" />
            </div>
            <div className="hidden h-11 w-56 rounded-xl bg-[#F2E8D5]/7 sm:block" />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="overflow-hidden rounded-2xl border border-[#F2E8D5]/8 bg-[#261d13]">
                <div className="aspect-[16/9] bg-[#F2E8D5]/7" />
                <div className="p-4">
                  <div className="h-5 w-3/4 rounded bg-[#F2E8D5]/8" />
                  <div className="mt-2 h-3 w-full rounded bg-[#F2E8D5]/5" />
                  <div className="mt-2 h-3 w-2/3 rounded bg-[#F2E8D5]/5" />
                  <div className="mt-4 flex items-center gap-2">
                    <div className="h-7 w-16 rounded bg-[#E3A64B]/8" />
                    <div className="h-7 w-20 rounded-full bg-[#E3A64B]/8" />
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
    <div className="absolute left-3 top-3 z-10 flex max-w-[85%] flex-wrap gap-1.5">
      {bestSeller ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#C0472B] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm">
          <Flame size={10} /> Best seller
        </span>
      ) : null}
      {option.isFeatured ? (
        <span className="rounded-full border border-[#E3A64B]/60 bg-[#241c13]/90 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#E3A64B] backdrop-blur">
          Featured
        </span>
      ) : null}
      {option.isNew ? (
        <span className="rounded-full border border-[#7A9B4E]/60 bg-[#241c13]/90 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#c9dba6] backdrop-blur">
          New
        </span>
      ) : null}
      {otherTags.map((tag) => (
        <span key={`${option.value}-${tag}`} className="rounded-full border border-[#F2E8D5]/20 bg-[#241c13]/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#F2E8D5]/80 backdrop-blur">
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
    return { items, totalQuantity, subtotal, deliveryFee, total: subtotal + deliveryFee };
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
      <main className="kiosk-board flex min-h-screen items-center justify-center px-4 text-[#F2E8D5]">
        <div className="max-w-sm rounded-2xl border border-[#C0472B]/30 bg-[#241c13] px-6 py-5 text-center shadow-xl">
          <p className="text-sm font-semibold">We couldn’t load the menu right now.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-[#C0472B] px-4 py-2 text-sm font-bold text-white">Try again</button>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className={`${display.variable} ${script.variable} ${mono.variable} kiosk-board flex min-h-screen items-center justify-center px-4 py-10 text-[#F2E8D5] sm:px-6`}>
        <div className="w-full max-w-lg">
          <div className="overflow-hidden rounded-[28px] border border-[#F2E8D5]/10 bg-[#241c13]/95 shadow-[0_30px_80px_-28px_rgba(0,0,0,0.8)] backdrop-blur">
            <div className="jeepney-stripe h-2 w-full" />
            <div className="p-7 sm:p-10">
              <div className="flex flex-col items-center text-center">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-[#7A9B4E] text-[#1a140d] shadow-[0_10px_30px_-12px_rgba(122,155,78,0.8)]"><CheckCircle2 size={32} /></span>
                <span className="mt-5 rounded-full border border-[#7A9B4E]/30 bg-[#7A9B4E]/10 px-3 py-1 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-[#c9dba6]">Order confirmed</span>
                <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-[#F6EFDD]">Thank you!</h1>
                <p className="mt-1 font-[family-name:var(--font-script)] text-xl text-[#F2E8D5]/65">salamat po — we're on it</p>
                {success.orderNumber ? <p className="mt-5 rounded-xl border border-dashed border-[#F2E8D5]/20 bg-[#1a140d] px-4 py-2 font-[family-name:var(--font-mono)] text-sm text-[#F2E8D5]/75">Order {success.orderNumber}</p> : null}
                <p className="mt-5 max-w-sm text-sm leading-6 text-[#F2E8D5]/60">Keep your tracking link handy so you can check your order status anytime.</p>
                <div className="mt-5 grid w-full gap-2.5">
                  <input readOnly value={success.trackingUrl} className="w-full min-w-0 rounded-xl border border-[#F2E8D5]/10 bg-[#1a140d] px-4 py-3 text-center font-[family-name:var(--font-mono)] text-xs text-[#F2E8D5]/75 outline-none" />
                  <div className="grid grid-cols-2 gap-2.5">
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(success.trackingUrl)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#F2E8D5]/10 bg-[#2b2117] px-3 py-3 font-semibold text-[#F2E8D5] transition hover:bg-[#35281c]"><Copy size={15} /> Copy</button>
                    <a href={success.trackingPath} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E3A64B] px-3 py-3 font-semibold text-[#20160d] transition hover:bg-[#f1b65f]">Track order <ExternalLink size={15} /></a>
                  </div>
                </div>
                <button type="button" onClick={handleStartNewOrder} className="mt-6 w-full rounded-xl bg-[#C0472B] px-5 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-[#F6EFDD] shadow-[0_10px_28px_-14px_rgba(192,71,43,0.9)] transition hover:bg-[#d05336]">Place another order</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const stepNavigation = (
    <nav className="mx-auto flex max-w-7xl gap-2.5 overflow-x-auto py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Order steps">
      {steps.map((item, index) => {
        const active = index === step;
        const complete = index < step;
        return (
          <button key={item.title} type="button" onClick={() => complete && setStep(index)} disabled={!complete && !active} className={`group flex shrink-0 items-center gap-2.5 rounded-full border px-3.5 py-2 transition ${active ? "border-[#E3A64B]/70 bg-[#E3A64B]/12 text-[#F6EFDD]" : complete ? "border-[#7A9B4E]/35 bg-[#7A9B4E]/8 text-[#c9dba6]" : "border-[#F2E8D5]/10 text-[#F2E8D5]/35"}`}>
            <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-extrabold ${active ? "bg-[#E3A64B] text-[#20160d]" : complete ? "bg-[#7A9B4E] text-[#17110b]" : "bg-[#34271a] text-[#F2E8D5]/40"}`}>{complete ? <Check size={13} /> : index + 1}</span>
            <span className="font-semibold">{item.title}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <main className={`${display.variable} ${script.variable} ${mono.variable} kiosk-board min-h-screen px-3 pb-8 pt-3 text-[#F2E8D5] sm:px-6 lg:px-8`}>
      <div className="mx-auto max-w-7xl">
        <header className="sticky top-0 z-40 -mx-3 border-b border-[#F2E8D5]/10 bg-[#17110b]/95 px-3 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#E3A64B] text-[#20160d] shadow-[0_8px_24px_-14px_rgba(227,166,75,0.9)]"><ChefHat size={20} /></div>
              <div className="min-w-0">
                <div className="font-[family-name:var(--font-display)] text-base font-extrabold leading-none text-[#F6EFDD]">Empanada Hauz</div>
                <div className="mt-1 truncate text-xs text-[#F2E8D5]/50">Freshly made, your way.</div>
              </div>
            </div>
            <button type="button" onClick={() => setBagOpen(true)} aria-label={`Open bag with ${summary.totalQuantity} pieces`} className="inline-flex items-center gap-2 rounded-full border border-[#F2E8D5]/10 bg-[#241c13] px-3 py-2 transition hover:border-[#E3A64B]/30 hover:bg-[#2b2117]">
              <ShoppingBag size={15} className="text-[#E3A64B]" />
              <span className="font-[family-name:var(--font-mono)] text-xs font-semibold text-[#F2E8D5]">{summary.totalQuantity} pcs</span>
              <span className="hidden text-[#F2E8D5]/30 sm:inline">·</span>
              <span className="hidden font-[family-name:var(--font-mono)] text-xs font-semibold text-[#E3A64B] sm:inline">Php {summary.total}</span>
            </button>
          </div>
        </header>

        <div className="sticky top-[67px] z-30 -mx-3 border-b border-[#F2E8D5]/10 bg-[#17110b]/90 px-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 lg:top-[68px]">
          {stepNavigation}
        </div>

        <section className="mt-0 overflow-hidden rounded-b-[30px] border-x border-b border-[#F2E8D5]/10 bg-[#241c13] shadow-[0_30px_90px_-35px_rgba(0,0,0,0.8)]">
          <div className="jeepney-stripe h-1.5 w-full" />
          <div className="grid gap-8 px-5 py-7 sm:px-8 sm:py-8 lg:grid-cols-[1.25fr_0.75fr] lg:px-10 lg:py-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#E3A64B]/30 bg-[#E3A64B]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#E3A64B]">Made to order <span className="h-1 w-1 rounded-full bg-[#E3A64B]/60" /> 10 pcs minimum</div>
              <h1 className="mt-4 max-w-3xl font-[family-name:var(--font-display)] text-4xl font-extrabold leading-[1.02] tracking-tight text-[#F6EFDD] sm:text-5xl lg:text-6xl">Build your box.<br /><span className="text-[#E3A64B]">We'll handle the rest.</span></h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#F2E8D5]/60 sm:text-base">Choose your favorite flavors, set your quantities, then tell us where to send your freshly made empanadas.</p>
              <Link href="/delivery-fee" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#E3A64B] underline underline-offset-4">Check delivery fee first →</Link>
              <div className="mt-6 hidden lg:block" />
            </div>
            <div className="hidden lg:flex lg:items-end lg:justify-end">
              <div className="max-w-xs rounded-2xl border border-dashed border-[#F2E8D5]/15 bg-[#1a140d] p-5 text-right">
                <div className="font-[family-name:var(--font-script)] text-2xl text-[#F2E8D5]/70">fresh from the pan</div>
                <div className="mt-1 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[#F2E8D5]/35">packed with care · delivered with love</div>
              </div>
            </div>
          </div>
        </section>

        <form id="kiosk-order-form" onSubmit={handleSubmit} className="mt-5">
          <section className="min-w-0 rounded-[26px] border border-[#F2E8D5]/10 bg-[#20180f] p-4 shadow-[0_22px_60px_-36px_rgba(0,0,0,0.8)] sm:p-6">
            {step === 0 ? (
              <>
                <div className="flex flex-col gap-4 border-b border-[#F2E8D5]/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-[#E3A64B]">Step 1 · shop</p>
                    <h2 className="mt-1.5 font-[family-name:var(--font-display)] text-2xl font-extrabold text-[#F6EFDD] sm:text-3xl">Choose your flavors</h2>
                    <p className="mt-1 text-sm text-[#F2E8D5]/50">Tap a flavor to add it. Then adjust your quantity.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="relative block min-w-0 flex-1 sm:w-56 sm:flex-none">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#F2E8D5]/35" />
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search flavors" className="w-full rounded-xl border border-[#F2E8D5]/10 bg-[#17110b] py-2.5 pl-9 pr-3 text-sm text-[#F6EFDD] outline-none placeholder:text-[#F2E8D5]/30 focus:border-[#E3A64B]/50" />
                    </label>
                    <button type="button" onClick={toggleAllFlavors} className="shrink-0 rounded-xl border border-[#E3A64B]/25 bg-[#E3A64B]/8 px-3 py-2.5 text-xs font-bold text-[#E3A64B] transition hover:bg-[#E3A64B]/12">{allFlavorsSelected ? "Clear" : "Select all"}</button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleFlavorOptions.length > 0 ? visibleFlavorOptions.map((option) => {
                    const selected = selectedFlavors.find((item) => item.value === option.value);
                    const soldOut = option.available === false;
                    const rating = getProductRating(option.value);
                    return (
                      <article key={option.value} className={`group relative overflow-hidden rounded-2xl border transition ${selected ? "border-[#E3A64B]/70 bg-[#2a2014] shadow-[0_12px_35px_-22px_rgba(227,166,75,0.9)]" : "border-[#F2E8D5]/8 bg-[#261d13] hover:-translate-y-0.5 hover:border-[#F2E8D5]/15"} ${soldOut ? "opacity-55" : ""}`}>
                        <ProductBadges option={option} />
                        <div className="relative aspect-[16/9] overflow-hidden bg-[#17110b]">
                          {option.imageUrl ? <img src={option.imageUrl} alt="" loading="lazy" decoding="async" fetchPriority="low" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_30%,rgba(227,166,75,.18),transparent_60%)]"><span className="font-[family-name:var(--font-script)] text-4xl text-[#E3A64B]/55">EH</span></div>}
                          <div className="absolute inset-0 bg-gradient-to-t from-[#17110b] via-transparent to-transparent" />
                          {soldOut ? <span className="absolute bottom-3 left-3 rounded-full bg-[#17110b]/85 px-2.5 py-1 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.16em] text-[#F2E8D5]/65">Sold out</span> : null}
                          {selected ? <span className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-[#E3A64B] text-[#20160d] shadow-lg"><Check size={16} /></span> : null}
                        </div>
                        <div className="p-4">
                          <button type="button" onClick={() => toggleFlavor(option.value)} disabled={soldOut} className="w-full text-left disabled:cursor-not-allowed">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="truncate font-[family-name:var(--font-display)] text-lg font-extrabold text-[#F6EFDD]">{option.value}</h3>
                                {option.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#F2E8D5]/45">{option.description}</p> : null}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <div className="font-[family-name:var(--font-mono)] text-sm font-semibold text-[#E3A64B]">Php {option.price}</div>
                                  {rating ? (
                                    <div className="inline-flex items-center gap-1 rounded-full border border-[#E3A64B]/20 bg-[#E3A64B]/8 px-2 py-1 text-[10px] font-bold text-[#E3A64B]">
                                      <Star size={11} fill="currentColor" />
                                      <span>{rating.ratingValue.toFixed(1)}</span>
                                      <span className="font-normal text-[#F2E8D5]/45">({rating.reviewCount})</span>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </button>
                          {selected ? <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2 border-t border-[#F2E8D5]/8 pt-3"><div className="grid h-11 grid-cols-[38px_minmax(0,1fr)_38px] overflow-hidden rounded-xl border border-[#F2E8D5]/10 bg-[#17110b]"><button type="button" aria-label={`Decrease ${option.label}`} onClick={() => stepFlavorQuantity(option.value, -1)} className="flex items-center justify-center border-r border-[#F2E8D5]/10 text-[#E3A64B] transition hover:bg-[#E3A64B]/8"><Minus size={15} /></button><input type="text" inputMode="numeric" pattern="[0-9]*" aria-label={`${option.label} quantity`} value={selected.quantity} onChange={(event) => updateFlavorQuantity(option.value, event.target.value)} onFocus={(event) => event.currentTarget.select()} className="h-full min-w-0 bg-transparent text-center font-[family-name:var(--font-mono)] text-sm font-bold text-[#F6EFDD] outline-none" /><button type="button" aria-label={`Increase ${option.label}`} onClick={() => stepFlavorQuantity(option.value, 1)} className="flex items-center justify-center border-l border-[#F2E8D5]/10 text-[#E3A64B] transition hover:bg-[#E3A64B]/8"><Plus size={15} /></button></div><button type="button" aria-label={`Add 5 ${option.label}`} onClick={() => stepFlavorQuantity(option.value, 5)} className="h-11 rounded-xl border border-[#E3A64B]/20 bg-[#E3A64B]/8 px-3 font-[family-name:var(--font-mono)] text-[11px] font-bold text-[#E3A64B]">+5</button></div> : null}
                        </div>
                      </article>
                    );
                  }) : <div className="col-span-full rounded-2xl border border-dashed border-[#F2E8D5]/10 bg-[#17110b] p-10 text-center"><Search className="mx-auto text-[#F2E8D5]/25" size={25} /><p className="mt-3 font-semibold text-[#F2E8D5]/55">No flavors match “{search}”.</p><button type="button" onClick={() => setSearch("")} className="mt-2 text-xs font-bold text-[#E3A64B]">Clear search</button></div>}
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <div className="space-y-5">
                <div>
                  <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-[#E3A64B]">Step 2 · details</p>
                  <h2 className="mt-1.5 font-[family-name:var(--font-display)] text-2xl font-extrabold text-[#F6EFDD] sm:text-3xl">How should we get it to you?</h2>
                  <p className="mt-1 text-sm text-[#F2E8D5]/50">Pick your delivery method, payment, and preferred date.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="rounded-2xl border border-[#F2E8D5]/8 bg-[#261d13] p-4"><span className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#F2E8D5]/55"><Truck size={14} className="text-[#E3A64B]" /> Delivery method</span><div className="grid grid-cols-2 gap-2">{deliveryMethods.map((option) => <button key={option.value} type="button" onClick={() => { handleChange("deliveryMethod", option.value); if (option.value !== "maxim") setDeliveryQuote(null); }} className={`min-h-12 rounded-xl border px-3 text-sm font-bold transition ${form.deliveryMethod === option.value ? "border-[#E3A64B]/60 bg-[#E3A64B]/12 text-[#E3A64B]" : "border-[#F2E8D5]/10 bg-[#17110b] text-[#F6EFDD]/60"}`}>{option.label}</button>)}</div></label>
                  <label className="rounded-2xl border border-[#F2E8D5]/8 bg-[#261d13] p-4"><span className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#F2E8D5]/55"><Wallet size={14} className="text-[#E3A64B]" /> Payment</span><div className="grid grid-cols-2 gap-2">{paymentMethods.map((option) => <button key={option.value} type="button" onClick={() => handleChange("paymentMethod", option.value)} className={`min-h-12 rounded-xl border px-3 text-sm font-bold transition ${form.paymentMethod === option.value ? "border-[#E3A64B]/60 bg-[#E3A64B]/12 text-[#E3A64B]" : "border-[#F2E8D5]/10 bg-[#17110b] text-[#F6EFDD]/60"}`}>{option.label}</button>)}</div></label>
                  <label className="rounded-2xl border border-[#F2E8D5]/8 bg-[#261d13] p-4 sm:col-span-2"><span className="mb-2.5 block text-xs font-bold uppercase tracking-[0.14em] text-[#F2E8D5]/55">Preferred date</span><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() + index); const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; return <button key={value} type="button" onClick={() => handleChange("deliveryDate", value)} className={`min-h-14 rounded-xl border px-2 text-left transition ${form.deliveryDate === value ? "border-[#E3A64B]/60 bg-[#E3A64B]/12 text-[#E3A64B]" : "border-[#F2E8D5]/10 bg-[#17110b] text-[#F6EFDD]/65"}`}><span className="block text-[10px] uppercase tracking-wider opacity-50">{date.toLocaleDateString(undefined, { weekday: "short" })}</span><span className="mt-1 block font-bold">{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></button>; })}</div></label>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-5">
                <div>
                  <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-[#E3A64B]">Step 3 · review</p>
                  <h2 className="mt-1.5 font-[family-name:var(--font-display)] text-2xl font-extrabold text-[#F6EFDD] sm:text-3xl">Almost there.</h2>
                  <p className="mt-1 text-sm text-[#F2E8D5]/50">Add your contact and delivery details, then place your order.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input placeholder="Full name" value={form.customerName} onChange={(event) => handleChange("customerName", event.target.value)} className="rounded-xl border border-[#F2E8D5]/10 bg-[#261d13] px-4 py-3.5 text-sm text-[#F6EFDD] outline-none placeholder:text-[#F2E8D5]/30 focus:border-[#E3A64B]/50" required />
                  <input placeholder="Contact number" value={form.phoneNumber} onChange={(event) => handleChange("phoneNumber", event.target.value)} className="rounded-xl border border-[#F2E8D5]/10 bg-[#261d13] px-4 py-3.5 text-sm text-[#F6EFDD] outline-none placeholder:text-[#F2E8D5]/30 focus:border-[#E3A64B]/50" required />
                  <input placeholder={form.deliveryMethod === "maxim" ? "Complete delivery address" : "Address"} value={form.address} onChange={(event) => handleChange("address", event.target.value)} onBlur={quoteDelivery} className="rounded-xl border border-[#F2E8D5]/10 bg-[#261d13] px-4 py-3.5 text-sm text-[#F6EFDD] outline-none placeholder:text-[#F2E8D5]/30 focus:border-[#E3A64B]/50 sm:col-span-2" required />
                  <input placeholder="Landmark / nearby place" value={form.landmark} onChange={(event) => handleChange("landmark", event.target.value)} onBlur={quoteDelivery} className="rounded-xl border border-[#F2E8D5]/10 bg-[#261d13] px-4 py-3.5 text-sm text-[#F6EFDD] outline-none placeholder:text-[#F2E8D5]/30 focus:border-[#E3A64B]/50 sm:col-span-2" required />
                  <textarea placeholder="Optional note for us" value={form.notes} onChange={(event) => handleChange("notes", event.target.value)} className="min-h-[110px] rounded-xl border border-[#F2E8D5]/10 bg-[#261d13] px-4 py-3.5 text-sm text-[#F6EFDD] outline-none placeholder:text-[#F2E8D5]/30 focus:border-[#E3A64B]/50 sm:col-span-2" />
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#F2E8D5]/8 bg-[#261d13] p-4"><input type="checkbox" checked={agreedToPolicy} onChange={(event) => setAgreedToPolicy(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#C0472B]" /><span className="text-sm leading-6 text-[#F2E8D5]/65">I agree that Empanada Hauz may collect and use my name, contact number, and address to process and deliver this order, as described in the <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#E3A64B] underline underline-offset-2">Privacy Policy</a>.</span></label>
              </div>
            ) : null}

            {error ? <p className="mt-5 rounded-xl border border-[#C0472B]/30 bg-[#C0472B]/10 px-4 py-3 text-sm text-[#f0a894]">{error}</p> : null}
          </section>
        </form>

        <p className="py-4 text-center font-[family-name:var(--font-script)] text-lg text-[#F2E8D5]/35">made fresh daily by Empanada Hauz</p>
      </div>

      {bagOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close bag" onClick={() => setBagOpen(false)} className="absolute inset-0 bg-[#0f0b07]/65 backdrop-blur-[2px]" />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-[#F3EBDD] text-[#241c13] shadow-[-24px_0_80px_-40px_rgba(0,0,0,0.85)]">
            <div className="flex items-center justify-between border-b border-dashed border-[#241c13]/15 px-5 py-5 sm:px-6">
              <div>
                <div className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-extrabold uppercase tracking-[0.16em]"><ShoppingBag size={17} /> Your bag</div>
                <p className="mt-1.5 text-xs text-[#241c13]/45">Your selections update live.</p>
              </div>
              <button type="button" onClick={() => setBagOpen(false)} aria-label="Close bag" className="grid h-10 w-10 place-items-center rounded-full border border-[#241c13]/10 bg-[#241c13]/5 transition hover:bg-[#241c13]/10"><X size={18} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4 sm:px-6">
              {summary.items.length > 0 ? summary.items.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3 border-b border-[#241c13]/7 py-3 first:pt-0 last:border-b-0"><div className="min-w-0"><div className="truncate text-sm font-bold">{item.name}</div><div className="mt-0.5 font-[family-name:var(--font-mono)] text-[11px] text-[#241c13]/45">{item.quantity} × Php {item.price}</div></div><div className="shrink-0 font-[family-name:var(--font-mono)] text-sm font-bold">Php {item.subtotal}</div></div>
              )) : <div className="py-16 text-center"><ShoppingBag className="mx-auto text-[#241c13]/20" size={30} /><p className="mt-3 text-sm font-semibold text-[#241c13]/45">Your bag is empty.</p><p className="mt-1 text-xs text-[#241c13]/35">Pick a flavor to get started.</p></div>}
            </div>
            <div className="border-t border-dashed border-[#241c13]/15 px-5 py-5 sm:px-6">
              {form.deliveryMethod === "maxim" && form.address.trim() ? <div className="mb-3 flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-1.5 text-[#241c13]/55"><Truck size={14} /> {quotingDelivery ? "Estimating delivery…" : "Est. delivery"}{!quotingDelivery && deliveryQuote?.distanceKm != null ? ` · ${deliveryQuote.distanceKm.toFixed(1)} km` : ""}</span><span className="font-[family-name:var(--font-mono)] font-bold">{quotingDelivery ? "…" : deliveryQuote ? `Php ${deliveryQuote.estimatedFare}` : "—"}</span></div> : null}
              <div className="flex items-end justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#241c13]/45">Total</div><div className="mt-1 font-[family-name:var(--font-mono)] text-2xl font-bold">Php {summary.total}</div></div><div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${summary.totalQuantity >= 10 ? "bg-[#7A9B4E]/15 text-[#4f6a34]" : "bg-[#C0472B]/10 text-[#a53b25]"}`}>{summary.totalQuantity >= 10 ? "Minimum reached" : `${remaining} pcs to go`}</div></div>
              {form.deliveryMethod === "maxim" ? <p className="mt-2 text-[10px] leading-4 text-[#241c13]/40">Delivery total uses an estimate until our team confirms the final fare.</p> : null}
              <div className="mt-4 grid gap-2">
                <button type="button" onClick={() => void copyOrderSummary()} disabled={summary.items.length === 0} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#241c13]/12 bg-[#241c13]/4 px-4 text-sm font-bold text-[#241c13] transition hover:bg-[#241c13]/8 disabled:cursor-not-allowed disabled:opacity-35"><Copy size={16} /> {summaryCopied ? "Copied!" : "Copy summary"}</button>
                <div className="flex gap-2.5">
                  <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} data-gesture-prev className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#241c13]/12 bg-[#241c13]/4 text-[#241c13] disabled:cursor-not-allowed disabled:opacity-25"><ArrowLeft size={17} /></button>
                  {step < steps.length - 1 ? <button type="button" onClick={() => { setStep((current) => current + 1); setBagOpen(false); }} disabled={!isStepValid} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#C0472B] px-4 text-sm font-extrabold uppercase tracking-[0.06em] text-white shadow-[0_10px_26px_-15px_rgba(192,71,43,0.95)] transition hover:bg-[#d05336] disabled:cursor-not-allowed disabled:opacity-35" data-gesture-next>Continue <ArrowRight size={16} /></button> : <button type="submit" form="kiosk-order-form" disabled={submitting || !agreedToPolicy} onClick={() => setBagOpen(false)} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#C0472B] px-4 text-sm font-extrabold uppercase tracking-[0.06em] text-white shadow-[0_10px_26px_-15px_rgba(192,71,43,0.95)] transition hover:bg-[#d05336] disabled:cursor-not-allowed disabled:opacity-35" data-gesture-next>{submitting ? "Placing order…" : "Place order"} <Check size={16} /></button>}
                </div>
                {step === 0 && summary.totalQuantity < 10 ? <p className="text-center font-[family-name:var(--font-script)] text-sm text-[#C0472B]">add {remaining} more piece{remaining === 1 ? "" : "s"} po</p> : null}
                {step === 2 && !agreedToPolicy ? <p className="text-center font-[family-name:var(--font-script)] text-sm text-[#C0472B]">please agree to the Privacy Policy to continue</p> : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      <GestureOrdering />

      <style jsx global>{`.kiosk-board{background:radial-gradient(circle at 10% 0%,rgba(227,166,75,.08),transparent 28rem),radial-gradient(circle at 100% 55%,rgba(47,143,122,.06),transparent 26rem),linear-gradient(160deg,#17110b 0%,#1c150e 55%,#17110b 100%)} .jeepney-stripe{background:repeating-linear-gradient(45deg,#c0472b 0px,#c0472b 12px,#f0b429 12px,#f0b429 24px,#2f8f7a 24px,#2f8f7a 36px,#f2e8d5 36px,#f2e8d5 48px)} .line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}`}</style>
    </main>
  );
}
