"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bike, Check, Clock3, MapPin, Navigation, Phone, RefreshCw, UserRound } from "lucide-react";
import { io } from "socket.io-client";
import { apiFetch } from "@/lib/api";
import { SOCKET_URL } from "@/lib/config";
import { RiderMap } from "@/components/rider/rider-map";

type Coordinate = { latitude: number; longitude: number };
type Profile = { id: string; status: "offline" | "online" | "busy" | "suspended"; rating: number; completedJobs: number; user: { name: string; email: string; role: string }; vehicles: Array<{ plateNumber?: string | null }>; locations: Array<Coordinate> };
type Job = {
  id: string; status: string; pickupAddress: string; pickupLatitude?: number | null; pickupLongitude?: number | null;
  dropoffAddress: string; dropoffLatitude?: number | null; dropoffLongitude?: number | null; distanceKm?: number | null;
  estimatedDurationMinutes?: number | null; estimatedFare?: number | null; finalFare?: number | null; notes?: string | null;
  order?: { orderNumber: string; quantity?: number; customer: { name: string; phoneNumber?: string | null } } | null;
};

const ACTIVE = ["requested", "searching_rider", "assigned", "accepted", "pickup_started", "picked_up", "delivering"];
const NEXT: Record<string, string> = { assigned: "accepted", accepted: "pickup_started", pickup_started: "picked_up", picked_up: "delivering", delivering: "delivered" };
const LABEL: Record<string, string> = { assigned: "Go to Pickup", accepted: "Confirm Pickup", pickup_started: "Confirm Pickup", picked_up: "Start Delivery", delivering: "Complete Delivery" };

export function RiderMapApp() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveLocation, setLiveLocation] = useState<Coordinate | null>(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [tab, setTab] = useState<"map" | "orders">("map");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const hydrate = useCallback(async () => {
    const [nextProfile, nextJobs] = await Promise.all([apiFetch<Profile>("/rider/me"), apiFetch<Job[]>("/rider/jobs")]);
    setProfile(nextProfile);
    setJobs(nextJobs);
    setSelectedId((current) => current && nextJobs.some((job) => job.id === current) ? current : nextJobs[0]?.id ?? null);
  }, []);

  useEffect(() => { hydrate().catch((err) => setError(err instanceof Error ? err.message : "Unable to load rider account")); }, [hydrate]);

  useEffect(() => {
    if (!profile?.id) return;
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"], reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1200 });
    const sync = () => void hydrate().catch(() => undefined);
    socket.on("connect", () => { socket.emit("rider.presence", { riderId: profile.id }); sync(); });
    ["rider.delivery.assigned", "rider.delivery.updated", "rider.status.updated", "delivery-network.jobs.updated"].forEach((event) => socket.on(event, sync));
    return () => { socket.disconnect(); };
  }, [hydrate, profile?.id]);

  useEffect(() => {
    if (!profile || profile.status === "offline" || profile.status === "suspended" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition((position) => {
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setLiveLocation(coords); setLocationEnabled(true);
      void apiFetch("/rider/location", { method: "POST", body: JSON.stringify({ ...coords, heading: position.coords.heading ?? undefined, speed: position.coords.speed ?? undefined, accuracy: position.coords.accuracy ?? undefined }) }).catch(() => undefined);
    }, (geoError) => { setLocationEnabled(false); setError(geoError.message); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [profile?.status]);

  const activeJobs = useMemo(() => jobs.filter((job) => ACTIVE.includes(job.status)), [jobs]);
  const currentJob = jobs.find((job) => job.id === selectedId) ?? activeJobs[0] ?? null;

  async function toggleOnline() {
    if (!profile || profile.status === "suspended") return;
    setBusy(true); setError(null);
    try { setProfile(await apiFetch<Profile>("/rider/status", { method: "PATCH", body: JSON.stringify({ status: profile.status === "online" ? "offline" : "online" }) })); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to update rider status"); }
    finally { setBusy(false); }
  }

  async function advance() {
    if (!currentJob || !NEXT[currentJob.status]) return;
    setBusy(true); setError(null);
    try { await apiFetch(`/rider/jobs/${currentJob.id}/status`, { method: "PATCH", body: JSON.stringify({ status: NEXT[currentJob.status] }) }); await hydrate(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to update order"); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-[calc(100dvh-2rem)] bg-[#f5f2ec] text-slate-950 -mx-4 -my-6 lg:-mx-8 lg:-my-8">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-7xl flex-col">
        <header className="border-b border-slate-200 bg-orange-500 px-4 py-4 text-white sm:px-6">
          <div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20"><Bike size={20} /></div><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/65">Empanada Hauz</p><p className="text-lg font-black italic">Rider</p></div></div><button onClick={() => setProfileOpen(true)} className="rounded-full bg-white/15 p-2.5"><UserRound size={18} /></button></div>
          <div className="mt-3 flex items-center justify-between"><button onClick={toggleOnline} disabled={busy} className="rounded-full bg-white/20 px-3 py-1.5 text-xs font-black">{profile?.status === "online" ? "● Online" : "○ Offline"}</button><div className="text-xs font-semibold text-white/75">{activeJobs.length} active · {profile?.rating?.toFixed(1) ?? "5.0"} ⭐</div></div>
        </header>

        {error ? <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">{error}</div> : null}

        <div className="mx-4 mt-3 flex rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200 sm:mx-6 lg:hidden"><button onClick={() => setTab("map")} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === "map" ? "bg-slate-950 text-white" : "text-slate-500"}`}>Map</button><button onClick={() => setTab("orders")} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === "orders" ? "bg-slate-950 text-white" : "text-slate-500"}`}>Orders</button></div>

        <main className="grid flex-1 gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
          <section className={`${tab === "orders" ? "hidden lg:block" : "block"} min-h-[620px]`}>
            <RiderMap job={currentJob} riderLocation={liveLocation ?? profile?.locations?.[0] ?? null} locationEnabled={locationEnabled} onLocate={() => navigator.geolocation?.getCurrentPosition((position) => setLiveLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }))} />
          </section>

          <aside className={`${tab === "map" ? "hidden lg:block" : "block"} rounded-[28px] bg-white p-4 shadow-sm ring-1 ring-slate-200`}>
            <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">Dispatch</p><h2 className="mt-1 text-xl font-black">Active Orders</h2></div><button onClick={() => hydrate()} className="rounded-xl p-2 text-slate-400"><RefreshCw size={17} /></button></div>
            <div className="mt-4 space-y-2">{activeJobs.length ? activeJobs.map((job) => <button key={job.id} onClick={() => setSelectedId(job.id)} className={`w-full rounded-2xl border p-3 text-left ${currentJob?.id === job.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-black">{job.order?.customer.name ?? "Customer"}</p><p className={`mt-1 truncate text-xs ${currentJob?.id === job.id ? "text-white/60" : "text-slate-500"}`}>{job.dropoffAddress}</p></div><Navigation size={16} className="shrink-0 opacity-50" /></div><div className="mt-3 flex items-center justify-between text-xs"><span className={`rounded-full px-2 py-1 font-bold ${currentJob?.id === job.id ? "bg-white/10" : "bg-slate-100"}`}>{LABEL[job.status] ?? job.status}</span><span className="opacity-60">{job.distanceKm != null ? `${job.distanceKm.toFixed(1)} km` : "Route"}</span></div></button>) : <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center"><Bike className="mx-auto text-slate-300" /><p className="mt-2 text-sm font-bold text-slate-600">No active delivery</p><p className="mt-1 text-xs text-slate-400">Go online to receive orders.</p></div>}</div>

            {currentJob ? <div className="mt-4 rounded-2xl bg-slate-50 p-4"><div className="grid grid-cols-2 gap-2"><Metric label="Distance" value={currentJob.distanceKm != null ? `${currentJob.distanceKm.toFixed(1)} km` : "—"} icon={<Navigation size={15} />} /><Metric label="ETA" value={currentJob.estimatedDurationMinutes != null ? `${currentJob.estimatedDurationMinutes} min` : "—"} icon={<Clock3 size={15} />} /></div><div className="mt-2 grid grid-cols-2 gap-2"><Metric label="Fare" value={`₱${Number(currentJob.finalFare ?? currentJob.estimatedFare ?? 0).toFixed(0)}`} icon={<span>₱</span>} /><Metric label="Items" value={String(currentJob.order?.quantity ?? "—")} icon={<Bike size={15} />} /></div><p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{["picked_up", "delivering"].includes(currentJob.status) ? "Drop-off" : "Pickup"}</p><p className="mt-1 text-sm font-bold leading-5">{["picked_up", "delivering"].includes(currentJob.status) ? currentJob.dropoffAddress : currentJob.pickupAddress}</p><div className="mt-3 flex gap-2">{currentJob.order?.customer.phoneNumber ? <a href={`tel:${currentJob.order.customer.phoneNumber}`} className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-center text-xs font-bold"><Phone className="mr-1 inline" size={14} /> Call</a> : null}<button onClick={advance} disabled={busy || !NEXT[currentJob.status]} className="flex-[1.5] rounded-xl bg-orange-500 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50">{busy ? "Updating…" : LABEL[currentJob.status] ?? "Open Order"}</button></div><button onClick={() => setTab("map")} className="mt-2 w-full rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-black text-white lg:hidden"><MapPin className="mr-1 inline" size={14} /> View route</button></div> : null}
          </aside>
        </main>

        {profileOpen ? <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4"><div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">Rider Profile</p><h3 className="mt-1 text-xl font-black">{profile?.user.name ?? "Rider"}</h3></div><button onClick={() => setProfileOpen(false)}><Check /></button></div><div className="mt-5 space-y-3"><div className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="font-bold">{profile?.user.email}</p><p className="mt-1 text-slate-500">Completed jobs: {profile?.completedJobs ?? 0}</p><p className="mt-1 text-slate-500">Vehicle plate: {profile?.vehicles?.[0]?.plateNumber ?? "Not set"}</p></div><button onClick={() => setProfileOpen(false)} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">Done</button></div></div></div> : null}
      </div>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="rounded-xl bg-white p-3"><div className="flex items-center gap-1.5 text-slate-400">{icon}<span className="text-[10px] font-black uppercase tracking-[0.1em]">{label}</span></div><p className="mt-1 text-sm font-black text-slate-950">{value}</p></div>; }
