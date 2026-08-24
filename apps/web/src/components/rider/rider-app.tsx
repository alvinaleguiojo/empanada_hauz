"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Bike,
  Check,
  ChevronRight,
  Clock3,
  MapPin,
  Menu,
  Phone,
  RefreshCw,
  Search,
  UserRound,
  X
} from "lucide-react";
import { apiFetch } from "@/lib/api";

export type RiderDelivery = {
  id: string;
  customerName: string;
  phoneNumber?: string | null;
  address?: string | null;
  quantity: number;
  totalAmount: number | string;
  preferredSchedule?: string | null;
  areaGroup?: string | null;
  deliveryStatus?: string | null;
  eta?: string | null;
  trackingLink?: string | null;
  riderName?: string | null;
  riderPlate?: string | null;
  bookingNotes?: string | null;
};

const statusLabels: Record<string, string> = {
  ready_for_booking: "Ready",
  booked: "In transit",
  completed: "Delivered",
  cancelled: "Cancelled"
};

export function RiderApp({ initialItems }: { initialItems: RiderDelivery[] }) {
  const [items, setItems] = useState(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(initialItems[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "ready_for_booking" | "booked">("all");
  const [riderName, setRiderName] = useState("");
  const [riderPlate, setRiderPlate] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRiderName(window.localStorage.getItem("empanada-rider-name") ?? "");
    setRiderPlate(window.localStorage.getItem("empanada-rider-plate") ?? "");
  }, []);

  useEffect(() => {
    if (!selectedId && items[0]) setSelectedId(items[0].id);
    if (selectedId && !items.some((item) => item.id === selectedId)) setSelectedId(items[0]?.id ?? null);
  }, [items, selectedId]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesFilter = filter === "all" || (item.deliveryStatus ?? "ready_for_booking") === filter;
      const matchesQuery = !q || [item.customerName, item.address, item.areaGroup, item.phoneNumber]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [filter, items, query]);

  const selected = items.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  const readyCount = items.filter((item) => !item.deliveryStatus || item.deliveryStatus === "ready_for_booking").length;
  const inTransitCount = items.filter((item) => item.deliveryStatus === "booked").length;
  const deliveredCount = items.filter((item) => item.deliveryStatus === "completed").length;

  function persistProfile() {
    window.localStorage.setItem("empanada-rider-name", riderName.trim());
    window.localStorage.setItem("empanada-rider-plate", riderPlate.trim());
    setProfileOpen(false);
  }

  function refreshQueue() {
    setError(null);
    startRefresh(async () => {
      try {
        const next = await apiFetch<RiderDelivery[]>("/deliveries/queue");
        setItems(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to refresh deliveries");
      }
    });
  }

  async function updateDelivery(item: RiderDelivery, status: "booked" | "completed") {
    setError(null);
    setSavingId(item.id);
    try {
      const updated = await apiFetch<any>(`/deliveries/orders/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          riderName: riderName.trim() || undefined,
          riderPlate: riderPlate.trim() || undefined,
          eta: status === "booked" ? item.eta ?? undefined : undefined
        })
      });

      setItems((current) => current.map((row) => row.id === item.id ? {
        ...row,
        deliveryStatus: updated.delivery?.status ?? status,
        riderName: updated.delivery?.riderName ?? row.riderName,
        riderPlate: updated.delivery?.riderPlate ?? row.riderPlate,
        eta: updated.delivery?.eta ?? row.eta
      } : row));
      setSavedId(item.id);
      window.setTimeout(() => setSavedId((current) => current === item.id ? null : current), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update delivery");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-2rem)] bg-[#f5f5f1] text-slate-950 -mx-4 -my-6 lg:-mx-8 lg:-my-8">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-6xl flex-col lg:flex-row">
        <aside className="border-b border-slate-200 bg-white lg:w-[360px] lg:border-b-0 lg:border-r">
          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:static">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white"><Bike size={20} /></div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Empanada Hauz</p>
                  <h1 className="text-lg font-bold">Rider</h1>
                </div>
              </div>
              <button onClick={() => setProfileOpen(true)} className="rounded-full border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50" aria-label="Rider profile"><UserRound size={18} /></button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Ready" value={readyCount} active={filter === "ready_for_booking"} onClick={() => setFilter(filter === "ready_for_booking" ? "all" : "ready_for_booking")} />
              <Stat label="Transit" value={inTransitCount} active={filter === "booked"} onClick={() => setFilter(filter === "booked" ? "all" : "booked")} />
              <Stat label="Done" value={deliveredCount} active={false} onClick={() => setFilter("all")} />
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Search size={16} className="text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer or area" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
              {query ? <button onClick={() => setQuery("")} aria-label="Clear search"><X size={15} className="text-slate-400" /></button> : null}
            </div>
          </div>

          <div className="max-h-[58dvh] overflow-y-auto px-3 py-3 lg:max-h-[calc(100dvh-220px)]">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Today&apos;s route</p>
              <button onClick={refreshQueue} disabled={refreshing} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Refresh deliveries"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /></button>
            </div>
            {visibleItems.length ? visibleItems.map((item) => (
              <button key={item.id} onClick={() => setSelectedId(item.id)} className={`mb-2 w-full rounded-2xl border p-3 text-left transition ${selected?.id === item.id ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.customerName}</p>
                    <p className={`mt-0.5 truncate text-sm ${selected?.id === item.id ? "text-white/65" : "text-slate-500"}`}>{item.areaGroup || item.address || "No area"}</p>
                  </div>
                  <ChevronRight size={17} className={selected?.id === item.id ? "text-white/60" : "text-slate-300"} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className={`rounded-full px-2 py-1 font-semibold ${selected?.id === item.id ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"}`}>{statusLabels[item.deliveryStatus || "ready_for_booking"]}</span>
                  <span className={selected?.id === item.id ? "text-white/60" : "text-slate-400"}>{item.quantity} pcs · ₱{Number(item.totalAmount).toLocaleString()}</span>
                </div>
              </button>
            )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No deliveries match this view.</div>}
          </div>
        </aside>

        <main className="flex-1 px-4 py-5 lg:px-8 lg:py-8">
          {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {selected ? (
            <div className="mx-auto max-w-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Delivery stop</p>
                  <h2 className="mt-1 text-3xl font-bold tracking-tight">{selected.customerName}</h2>
                  <p className="mt-1 text-sm text-slate-500">{selected.areaGroup || "Route stop"}</p>
                </div>
                <div className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-200">{statusLabels[selected.deliveryStatus || "ready_for_booking"]}</div>
              </div>

              <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-xl bg-slate-100 p-2.5 text-slate-700"><MapPin size={19} /></div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Deliver to</p>
                    <p className="mt-1 text-base font-semibold leading-6">{selected.address || "Address not provided"}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={selected.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.address)}` : "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><MapPin size={16} /> Navigate</a>
                  {selected.phoneNumber ? <a href={`tel:${selected.phoneNumber}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Phone size={16} /> Call customer</a> : null}
                  {selected.trackingLink ? <a href={selected.trackingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Tracking</a> : null}
                </div>
              </section>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <InfoTile icon={<Bike size={17} />} label="Order" value={`${selected.quantity} pcs`} />
                <InfoTile icon={<Clock3 size={17} />} label="Schedule" value={selected.preferredSchedule ? new Date(selected.preferredSchedule).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "ASAP"} />
                <InfoTile icon={<span className="text-sm font-bold">₱</span>} label="Collect" value={`₱${Number(selected.totalAmount).toLocaleString()}`} />
              </div>

              {selected.bookingNotes ? <section className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><span className="font-bold">Booking note:</span> {selected.bookingNotes}</section> : null}

              <section className="mt-5">
                {(selected.deliveryStatus === "booked" || !selected.deliveryStatus || selected.deliveryStatus === "ready_for_booking") ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ActionButton
                      label={selected.deliveryStatus === "booked" ? "Mark delivered" : "Start delivery"}
                      loading={savingId === selected.id}
                      complete={savedId === selected.id && selected.deliveryStatus !== "booked"}
                      onClick={() => updateDelivery(selected, selected.deliveryStatus === "booked" ? "completed" : "booked")}
                    />
                    <button onClick={() => setProfileOpen(true)} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left hover:border-slate-300">
                      <p className="text-sm font-bold">Rider details</p>
                      <p className="mt-1 text-xs text-slate-500">{riderName || "Add your name"}{riderPlate ? ` · ${riderPlate}` : ""}</p>
                    </button>
                  </div>
                ) : null}
                {selected.deliveryStatus === "completed" ? <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-800"><Check size={18} /> Delivery completed</div> : null}
              </section>
            </div>
          ) : (
            <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center text-center"><div><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white"><Bike size={24} /></div><h2 className="mt-4 text-2xl font-bold">No delivery selected</h2><p className="mt-1 text-sm text-slate-500">Your route will appear here when jobs are available.</p></div></div>
          )}
        </main>
      </div>

      {profileOpen ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Rider profile</p><h3 className="mt-1 text-xl font-bold">Your delivery identity</h3></div><button onClick={() => setProfileOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
          <div className="mt-5 space-y-3">
            <label className="block"><span className="text-sm font-semibold text-slate-700">Name</span><input value={riderName} onChange={(event) => setRiderName(event.target.value)} placeholder="e.g. Juan Dela Cruz" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-slate-950" /></label>
            <label className="block"><span className="text-sm font-semibold text-slate-700">Plate / rider ID</span><input value={riderPlate} onChange={(event) => setRiderPlate(event.target.value)} placeholder="e.g. ABC 1234" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-slate-950" /></label>
          </div>
          <button onClick={persistProfile} className="mt-5 w-full rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-bold text-white hover:bg-slate-800">Save rider details</button>
        </div>
      </div> : null}
    </div>
  );
}

function Stat({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`rounded-xl p-2.5 text-left ${active ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-700"}`}><p className={`text-[11px] font-bold uppercase tracking-wide ${active ? "text-white/65" : "text-slate-400"}`}>{label}</p><p className="mt-1 text-lg font-bold">{value}</p></button>;
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-slate-400">{icon}<span className="text-[11px] font-bold uppercase tracking-[0.12em]">{label}</span></div><p className="mt-2 truncate text-sm font-bold text-slate-800">{value}</p></div>;
}

function ActionButton({ label, loading, complete, onClick }: { label: string; loading: boolean; complete: boolean; onClick: () => void }) {
  return <button onClick={onClick} disabled={loading} className="flex min-h-16 items-center justify-between rounded-2xl bg-slate-950 px-5 text-left text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"><div><p className="text-sm font-bold">{complete ? "Saved" : label}</p><p className="mt-1 text-xs text-white/55">{complete ? "Route updated" : "Update delivery status"}</p></div>{complete ? <Check size={20} /> : loading ? <RefreshCw size={20} className="animate-spin" /> : <ChevronRight size={20} className="text-white/55" />}</button>;
}
