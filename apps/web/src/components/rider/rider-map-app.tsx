"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bike, Bell, Check, Clock3, MapPin, Menu, Phone, RefreshCw, UserRound } from "lucide-react";
import { io } from "socket.io-client";
import { apiFetch } from "@/lib/api";
import { SOCKET_URL } from "@/lib/config";
import { RiderMap } from "@/components/rider/rider-map";

type Coordinate = { latitude: number; longitude: number };
type RiderStatus = "offline" | "online" | "busy" | "suspended";
type Profile = {
  id: string;
  status: RiderStatus;
  rating: number;
  completedJobs: number;
  phoneNumber?: string | null;
  serviceArea?: string | null;
  user: { name: string; email: string; role: string };
  vehicles: Array<{ type: string; model?: string | null; plateNumber?: string | null }>;
  locations: Array<Coordinate>;
};
type Job = {
  id: string;
  status: string;
  pickupAddress: string;
  pickupLatitude?: number | null;
  pickupLongitude?: number | null;
  dropoffAddress: string;
  dropoffLatitude?: number | null;
  dropoffLongitude?: number | null;
  distanceKm?: number | null;
  estimatedDurationMinutes?: number | null;
  estimatedFare?: number | null;
  finalFare?: number | null;
  notes?: string | null;
  deliveredAt?: string | null;
  order?: { orderNumber: string; quantity?: number; customer: { name: string; phoneNumber?: string | null } } | null;
};

const ACTIVE = ["requested", "searching_rider", "assigned", "accepted", "pickup_started", "picked_up", "delivering"];
const NEXT: Record<string, string> = {
  assigned: "accepted",
  accepted: "pickup_started",
  pickup_started: "picked_up",
  picked_up: "delivering",
  delivering: "delivered"
};
const LABEL: Record<string, string> = {
  assigned: "Go to Pickup",
  accepted: "Confirm Pickup",
  pickup_started: "Confirm Pickup",
  picked_up: "Start Delivery",
  delivering: "Complete Delivery"
};

type Tab = "orders" | "map" | "earnings" | "profile";

export function RiderMapApp() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveLocation, setLiveLocation] = useState<Coordinate | null>(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [tab, setTab] = useState<Tab>("orders");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    const [nextProfile, nextJobs] = await Promise.all([
      apiFetch<Profile>("/rider/me"),
      apiFetch<Job[]>("/rider/jobs")
    ]);
    setProfile(nextProfile);
    setJobs(nextJobs);
    setSelectedId((current) => current && nextJobs.some((job) => job.id === current) ? current : nextJobs[0]?.id ?? null);
  }, []);

  useEffect(() => {
    hydrate().catch((err) => setError(err instanceof Error ? err.message : "Unable to load rider account"));
  }, [hydrate]);

  useEffect(() => {
    if (!profile?.id) return;
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1200
    });
    const sync = () => void hydrate().catch(() => undefined);
    socket.on("connect", () => {
      socket.emit("rider.presence", { riderId: profile.id });
      sync();
    });
    ["rider.delivery.assigned", "rider.delivery.updated", "rider.status.updated", "delivery-network.jobs.updated"].forEach((event) => socket.on(event, sync));
    return () => {
      socket.disconnect();
    };
  }, [hydrate, profile?.id]);

  useEffect(() => {
    if (!profile || profile.status === "offline" || profile.status === "suspended" || !navigator.geolocation) {
      return;
    }
    const watchId = navigator.geolocation.watchPosition((position) => {
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setLiveLocation(coords);
      setLocationEnabled(true);
      void apiFetch("/rider/location", {
        method: "POST",
        body: JSON.stringify({
          ...coords,
          heading: position.coords.heading ?? undefined,
          speed: position.coords.speed ?? undefined,
          accuracy: position.coords.accuracy ?? undefined
        })
      }).catch(() => undefined);
    }, (geoError) => {
      setLocationEnabled(false);
      setError(geoError.message);
    }, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000
    });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [profile?.status]);

  const activeJobs = useMemo(() => jobs.filter((job) => ACTIVE.includes(job.status)), [jobs]);
  const deliveredJobs = useMemo(() => jobs.filter((job) => job.status === "delivered"), [jobs]);
  const currentJob = jobs.find((job) => job.id === selectedId) ?? activeJobs[0] ?? null;
  const todayEarnings = deliveredJobs.reduce((sum, job) => sum + Number(job.finalFare ?? job.estimatedFare ?? 0), 0);
  const riderLocation = liveLocation ?? profile?.locations?.[0] ?? null;

  async function toggleOnline() {
    if (!profile || profile.status === "suspended") return;
    setBusy(true);
    setError(null);
    try {
      const status = profile.status === "online" ? "offline" : "online";
      setProfile(await apiFetch<Profile>("/rider/status", {
        method: "PATCH",
        body: JSON.stringify({ status })
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update rider status");
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!currentJob || !NEXT[currentJob.status]) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/rider/jobs/${currentJob.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: NEXT[currentJob.status] })
      });
      await hydrate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update order");
    } finally {
      setBusy(false);
    }
  }

  const navItems: Array<{ id: Tab; label: string; icon: string }> = [
    { id: "orders", label: "Orders", icon: "🧾" },
    { id: "map", label: "Map", icon: "🗺️" },
    { id: "earnings", label: "Earnings", icon: "📊" },
    { id: "profile", label: "Profile", icon: "👤" }
  ];

  return (
    <div className="min-h-[100dvh] bg-[#FFF6EC] text-[#241C18] -mx-4 -my-6 lg:-mx-8 lg:-my-8">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[680px] flex-col bg-[#FFF6EC] shadow-sm lg:border-x lg:border-[#F0E4D6]">
        <div className="flex-1 overflow-y-auto pb-24">
          <header className="rounded-b-[30px] bg-[#F4581D] px-5 pb-5 pt-5 text-white">
            <div className="flex items-center justify-between">
              <button className="flex h-10 w-10 items-center justify-center" aria-label="Menu"><Menu size={24} /></button>
              <div className="flex items-center gap-2.5">
                <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-white/20 text-lg">🥟</div>
                <div className="leading-none">
                  <div className="text-[15px] font-extrabold italic">Empanada</div>
                  <div className="text-[17px] font-black italic text-[#3B140A]">Hauz</div>
                </div>
              </div>
              <button className="relative flex h-10 w-10 items-center justify-center" aria-label="Notifications">
                <Bell size={21} />
                {activeJobs.length > 0 ? <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D5473A] px-1 text-[9px] font-black">{activeJobs.length}</span> : null}
              </button>
            </div>
          </header>

          {error ? <div className="mx-5 mt-3 rounded-2xl border border-[#F3D2B6] bg-[#FFF0E3] px-4 py-3 text-xs font-semibold text-[#8A3E1D]">{error}</div> : null}

          {tab === "orders" ? (
            <OrdersScreen profile={profile} activeJobs={activeJobs} deliveredJobs={deliveredJobs} busy={busy} onToggleOnline={toggleOnline} currentJob={currentJob} onAdvance={advance} onRefresh={hydrate} />
          ) : null}

          {tab === "map" ? (
            <MapScreen currentJob={currentJob} riderLocation={riderLocation} locationEnabled={locationEnabled} onLocate={() => navigator.geolocation?.getCurrentPosition((position) => setLiveLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }))} busy={busy} onAdvance={advance} />
          ) : null}

          {tab === "earnings" ? (
            <EarningsScreen deliveredJobs={deliveredJobs} todayEarnings={todayEarnings} />
          ) : null}

          {tab === "profile" ? (
            <ProfileScreen profile={profile} />
          ) : null}
        </div>

        <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[680px] -translate-x-1/2 border-t border-[#F0E4D6] bg-white px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 lg:absolute">
          {navItems.map((item) => {
            const active = item.id === tab;
            return (
              <button key={item.id} onClick={() => setTab(item.id)} className="flex flex-1 flex-col items-center gap-1 py-1">
                <span className={`text-[20px] ${active ? "opacity-100" : "opacity-50"}`}>{item.icon}</span>
                <span className={`text-[11px] font-bold ${active ? "font-black text-[#F4581D]" : "text-[#8A817A]"}`}>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function OrdersScreen({
  profile,
  activeJobs,
  deliveredJobs,
  busy,
  onToggleOnline,
  currentJob,
  onAdvance,
  onRefresh
}: {
  profile: Profile | null;
  activeJobs: Job[];
  deliveredJobs: Job[];
  busy: boolean;
  onToggleOnline: () => void;
  currentJob: Job | null;
  onAdvance: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="pt-5">
      <div className="mx-5 rounded-full bg-white px-4 py-3 shadow-sm ring-1 ring-[#F0E4D6]">
        <div className="flex items-center justify-between">
          <button onClick={onToggleOnline} disabled={busy} className={`rounded-full px-3 py-1.5 text-xs font-black ${profile?.status === "online" ? "bg-[#E4F6EB] text-[#1FA35A]" : "bg-[#F6EEE7] text-[#8A817A]"}`}>
            {profile?.status === "online" ? "● Online" : "○ Offline"}
          </button>
          <span className="text-[11px] font-bold text-[#8A817A]">{activeJobs.length} active · {profile?.rating?.toFixed(1) ?? "5.0"} ⭐</span>
        </div>
      </div>

      <div className="mt-3 flex gap-3 px-5">
        <StatBox value={String(activeJobs.length)} label="Today's Orders" />
        <StatBox value={String(profile?.completedJobs ?? 0)} label="Completed" />
        <StatBox value={`${(profile?.rating ?? 5).toFixed(1)} ⭐`} label="Rider Rating" />
      </div>

      <SectionTitle title="Active Orders" count={activeJobs.length} />
      {currentJob ? <ActiveOrder job={currentJob} busy={busy} onAdvance={onAdvance} /> : (
        <div className="mx-5 rounded-[22px] bg-white p-7 text-center shadow-sm ring-1 ring-[#F0E4D6]">
          <div className="text-3xl">🥟</div>
          <div className="mt-2 text-sm font-black text-[#241C18]">{profile?.status === "online" ? "Waiting for an order" : "You're offline"}</div>
          <div className="mt-1 text-xs leading-5 text-[#8A817A]">{profile?.status === "online" ? "Keep the app open — dispatch will notify you when your next delivery arrives." : "Go online when you're ready to receive deliveries."}</div>
        </div>
      )}

      <SectionTitle title="Recent Orders" />
      <div className="mx-5 rounded-[22px] bg-white shadow-sm ring-1 ring-[#F0E4D6]">
        {deliveredJobs.length ? deliveredJobs.slice(0, 6).map((job, index) => <RecentRow key={job.id} job={job} last={index === Math.min(5, deliveredJobs.length - 1)} />) : <div className="p-5 text-center text-xs text-[#8A817A]">No deliveries completed yet today.</div>}
      </div>
      <button onClick={onRefresh} className="mx-5 mt-3 flex w-[calc(100%-40px)] items-center justify-center gap-2 rounded-2xl bg-white py-3 text-xs font-black text-[#5C5450] ring-1 ring-[#F0E4D6]"><RefreshCw size={14} /> Refresh</button>
    </div>
  );
}

function ActiveOrder({ job, busy, onAdvance }: { job: Job; busy: boolean; onAdvance: () => void }) {
  const isNew = job.status === "assigned";
  const fare = Number(job.finalFare ?? job.estimatedFare ?? 0);
  const address = job.status === "delivering" ? job.dropoffAddress : job.pickupAddress;
  return (
    <div className="mx-5 rounded-[22px] border-[1.5px] border-[#F4581D] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 rounded-[10px] bg-[#FFE3D2] px-2.5 py-1.5 text-[11px] font-extrabold text-[#D9430F]">{isNew ? "🕐" : "🚴"} {isNew ? "New Order" : "Current Order"}</span>
        <span className="text-xs font-extrabold text-[#8A817A]">#{job.order?.orderNumber ?? `EH-${job.id.slice(-4).toUpperCase()}`}</span>
      </div>
      <div className="mt-4 flex items-start gap-3.5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFE3D2] text-[26px]">🥟</div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold text-[#241C18]">👤 {job.order?.customer.name ?? "Customer"}</div>
          <div className="mt-1 text-[13px] leading-[18px] text-[#5C5450]">📍 {address}</div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div><div className="text-[19px] font-black">₱{fare.toFixed(0)}</div>{job.order?.quantity ? <div className="text-[11px] text-[#8A817A]">({job.order.quantity} pcs Empanada)</div> : null}</div>
        <button disabled={busy || !NEXT[job.status]} onClick={onAdvance} className="rounded-2xl bg-[#F4581D] px-5 py-3 text-[13px] font-black text-white disabled:opacity-50">➤ {busy ? "Updating…" : LABEL[job.status] ?? "Open Order"}</button>
      </div>
    </div>
  );
}

function MapScreen({ currentJob, riderLocation, locationEnabled, onLocate, busy, onAdvance }: { currentJob: Job | null; riderLocation: Coordinate | null; locationEnabled: boolean; onLocate: () => void; busy: boolean; onAdvance: () => void }) {
  return (
    <div className="pt-3">
      <div className="mx-5 mb-3 flex items-center justify-between">
        <div><div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#8A817A]">Route</div><div className="mt-1 text-xl font-black">Current Delivery</div></div>
        <button onClick={onLocate} className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#F4581D] shadow-sm ring-1 ring-[#F0E4D6]">◎ Locate</button>
      </div>
      <div className="mx-5 overflow-hidden rounded-[22px] shadow-sm ring-1 ring-[#F0E4D6]" style={{ height: "min(54vh, 520px)" }}>
        <RiderMap job={currentJob} riderLocation={riderLocation} locationEnabled={locationEnabled} onLocate={onLocate} />
      </div>
      {currentJob ? (
        <div className="mx-5 mt-3 rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-[#F0E4D6]">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFE3D2] text-[22px]">🥟</div>
            <div className="min-w-0 flex-1"><div className="text-sm font-black">Order #{currentJob.order?.orderNumber ?? currentJob.id.slice(-4).toUpperCase()}</div><div className="mt-0.5 text-xs font-bold text-[#5C5450]">{currentJob.order?.customer.name ?? "Customer"}</div><div className="mt-1 truncate text-[11px] text-[#8A817A]">📍 {currentJob.status === "delivering" ? currentJob.dropoffAddress : currentJob.pickupAddress}</div></div>
            <div className="text-right"><div className="rounded-lg bg-[#FFE3D2] px-2 py-1 text-[10px] font-black text-[#D9430F]">{["picked_up", "delivering"].includes(currentJob.status) ? "Drop-off" : "Pickup"}</div>{currentJob.distanceKm != null ? <div className="mt-1 text-[10px] font-bold text-[#5C5450]">🚗 {currentJob.distanceKm.toFixed(1)} km</div> : null}</div>
          </div>
          <button disabled={busy || !NEXT[currentJob.status]} onClick={onAdvance} className="mt-3 w-full rounded-2xl bg-[#F4581D] py-3 text-sm font-black text-white disabled:opacity-50">➤ {busy ? "Updating…" : LABEL[currentJob.status] ?? "Open Order"}</button>
        </div>
      ) : <div className="mx-5 mt-3 rounded-[22px] bg-white p-5 text-center text-xs text-[#8A817A] shadow-sm ring-1 ring-[#F0E4D6]">No active delivery right now. Go online to receive orders.</div>}
    </div>
  );
}

function EarningsScreen({ deliveredJobs, todayEarnings }: { deliveredJobs: Job[]; todayEarnings: number }) {
  return (
    <div className="pt-5">
      <div className="mx-5 rounded-[22px] bg-[#241C18] p-5 text-white shadow-sm">
        <div className="text-xs font-extrabold text-[#C9BEB6]">Today's Earnings</div>
        <div className="mt-1 text-[36px] font-black">₱{todayEarnings.toFixed(2)}</div>
        <div className="mt-1 text-xs text-[#C9BEB6]">{deliveredJobs.length} completed deliveries</div>
      </div>
      <SectionTitle title="Delivery History" />
      <div className="mx-5 rounded-[22px] bg-white shadow-sm ring-1 ring-[#F0E4D6]">
        {deliveredJobs.length ? deliveredJobs.map((job, index) => <RecentRow key={job.id} job={job} last={index === deliveredJobs.length - 1} />) : <div className="p-5 text-center text-xs text-[#8A817A]">No deliveries completed yet today.</div>}
      </div>
    </div>
  );
}

function ProfileScreen({ profile }: { profile: Profile | null }) {
  if (!profile) return null;
  const vehicle = profile.vehicles[0];
  return (
    <div className="pt-5">
      <div className="mx-5 rounded-[22px] bg-white p-5 text-center shadow-sm ring-1 ring-[#F0E4D6]">
        <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#FFE3D2] text-[30px] font-black text-[#F4581D]">{profile.user.name.slice(0, 1).toUpperCase()}</div>
        <div className="mt-2 text-xl font-black">{profile.user.name}</div>
        <div className="mt-0.5 text-[13px] text-[#8A817A]">{profile.user.email}</div>
        <div className="mt-5 flex gap-2.5">
          <ProfileStat value={profile.rating.toFixed(1)} label="Rating" />
          <ProfileStat value={String(profile.completedJobs)} label="Deliveries" />
        </div>
        <ProfileLine title="Vehicle" value={vehicle ? `${vehicle.model ?? vehicle.type} · ${vehicle.plateNumber ?? "No plate"}` : "Not assigned"} />
        <ProfileLine title="Service area" value={profile.serviceArea ?? "All areas"} />
        <ProfileLine title="Phone" value={profile.phoneNumber ?? "Not provided"} />
        <div className="mt-5 rounded-2xl bg-[#FFF6EC] px-4 py-3 text-left text-xs"><span className="font-bold text-[#8A817A]">Status</span><div className="mt-1 font-black text-[#241C18]">{profile.status === "online" ? "Online and accepting deliveries" : "Offline"}</div></div>
      </div>
    </div>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  return <div className="flex-1 rounded-[18px] bg-white p-3 text-center shadow-sm ring-1 ring-[#F0E4D6]"><div className="text-[17px] font-black">{value}</div><div className="mt-0.5 text-[10px] text-[#8A817A]">{label}</div></div>;
}
function SectionTitle({ title, count }: { title: string; count?: number }) {
  return <div className="mt-6 mb-3 flex items-center justify-between px-5"><div className="text-[15px] font-black">{title}</div>{typeof count === "number" ? <div className="rounded-full bg-[#FFE3D2] px-2.5 py-1 text-[10px] font-black text-[#D9430F]">{count}</div> : null}</div>;
}
function RecentRow({ job, last }: { job: Job; last: boolean }) {
  return <div className={`flex items-center gap-3 px-4 py-3.5 ${last ? "" : "border-b border-[#F0E4D6]"}`}><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFE3D2] text-xl">🥟</div><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-black">{job.order?.customer.name ?? "Customer"}</div><div className="mt-0.5 truncate text-[11px] text-[#8A817A]">{job.dropoffAddress}</div></div><div className="text-right"><div className="text-xs font-black text-[#1FA35A]">₱{Number(job.finalFare ?? job.estimatedFare ?? 0).toFixed(0)}</div><div className="mt-0.5 text-[10px] text-[#8A817A]">Delivered</div></div></div>;
}
function ProfileStat({ value, label }: { value: string; label: string }) {
  return <div className="flex-1 rounded-2xl bg-[#FFF6EC] py-3"><div className="text-[18px] font-black">{value}</div><div className="mt-0.5 text-[11px] text-[#8A817A]">{label}</div></div>;
}
function ProfileLine({ title, value }: { title: string; value: string }) {
  return <div className="mt-2 flex justify-between gap-4 border-t border-[#F0E4D6] py-2.5 text-left"><span className="text-xs font-bold text-[#8A817A]">{title}</span><span className="text-right text-xs font-extrabold text-[#241C18]">{value}</span></div>;
}
