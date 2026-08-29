"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, LocateFixed, MapPin, Menu, Navigation, Phone, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Coordinate = { latitude: number; longitude: number };
type Profile = {
  id: string;
  status: "offline" | "online" | "busy" | "suspended";
  rating: number;
  completedJobs: number;
  user: { name: string; email: string; role: string };
  locations: Coordinate[];
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
  order?: { orderNumber: string; quantity?: number; customer: { name: string; phoneNumber?: string | null } } | null;
};
type RouteStep = { maneuver?: { instruction?: string; type?: string; modifier?: string }; name?: string; distance?: number; duration?: number };
type RouteData = { geometry: { coordinates: [number, number][] }; distance: number; duration: number; legs?: Array<{ steps?: RouteStep[] }> };

const ACTIVE = ["requested", "searching_rider", "assigned", "accepted", "pickup_started", "picked_up", "delivering"];
const NEXT: Record<string, string> = { assigned: "accepted", accepted: "pickup_started", pickup_started: "picked_up", picked_up: "delivering", delivering: "delivered" };
const LABEL: Record<string, string> = { assigned: "Go to Pickup", accepted: "Confirm Pickup", pickup_started: "Confirm Pickup", picked_up: "Start Delivery", delivering: "Complete Delivery" };

declare global { interface Window { L?: any } }

function valid(c?: Coordinate | null): c is Coordinate {
  return !!c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude);
}

function useLeaflet() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.L) { setReady(true); return; }
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
    const script = document.createElement("script"); script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; script.async = true; script.onload = () => setReady(true); document.body.appendChild(script);
    return () => { script.remove(); css.remove(); };
  }, []);
  return ready;
}

export function RiderAppV2() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [tab, setTab] = useState<"orders" | "map">("orders");
  const [navigation, setNavigation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    const [p, j] = await Promise.all([apiFetch<Profile>("/rider/me"), apiFetch<Job[]>("/rider/jobs")]);
    setProfile(p); setJobs(j);
    setSelectedId((old) => old && j.some(x => x.id === old) ? old : j.find(x => ACTIVE.includes(x.status))?.id ?? null);
  }, []);

  useEffect(() => { hydrate().catch(e => setError(e instanceof Error ? e.message : "Unable to load orders")); }, [hydrate]);

  useEffect(() => {
    if (!profile || profile.status === "offline" || profile.status === "suspended" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(pos => {
      const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setLocation(c);
      void apiFetch("/rider/location", { method: "POST", body: JSON.stringify({ ...c, heading: pos.coords.heading ?? undefined, speed: pos.coords.speed ?? undefined, accuracy: pos.coords.accuracy ?? undefined }) }).catch(() => undefined);
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [profile?.status]);

  const activeJobs = useMemo(() => jobs.filter(j => ACTIVE.includes(j.status)), [jobs]);
  const delivered = useMemo(() => jobs.filter(j => j.status === "delivered"), [jobs]);
  const selected = jobs.find(j => j.id === selectedId) ?? activeJobs[0] ?? null;

  async function toggleOnline() {
    if (!profile || profile.status === "suspended") return;
    setBusy(true); setError(null);
    try { setProfile(await apiFetch<Profile>("/rider/status", { method: "PATCH", body: JSON.stringify({ status: profile.status === "online" ? "offline" : "online" }) })); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to update status"); }
    finally { setBusy(false); }
  }

  async function advance(job: Job) {
    if (!NEXT[job.status]) return;
    setBusy(true); setError(null);
    try { await apiFetch(`/rider/jobs/${job.id}/status`, { method: "PATCH", body: JSON.stringify({ status: NEXT[job.status] }) }); await hydrate(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to update order"); }
    finally { setBusy(false); }
  }

  function openNavigation(job: Job) {
    setSelectedId(job.id); setTab("map"); setNavigation(true);
  }

  return <div className="min-h-[100dvh] bg-[#FFF6EC] text-[#241C18] -mx-4 -my-6 lg:-mx-8 lg:-my-8">
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[680px] flex-col bg-[#FFF6EC] shadow-sm lg:border-x lg:border-[#F0E4D6]">
      <header className="rounded-b-[30px] bg-[#F4581D] px-5 pb-5 pt-5 text-white">
        <div className="flex items-center justify-between"><button className="flex h-10 w-10 items-center justify-center"><Menu size={24}/></button><div className="text-center"><div className="text-[15px] font-extrabold italic">Empanada</div><div className="text-[17px] font-black italic text-[#3B140A]">Hauz Rider</div></div><button className="flex h-10 w-10 items-center justify-center"><Bell size={21}/></button></div>
      </header>
      {error ? <div className="mx-5 mt-3 rounded-2xl border border-[#F3D2B6] bg-[#FFF0E3] px-4 py-3 text-xs font-semibold text-[#8A3E1D]">{error}</div> : null}
      <main className="flex-1 overflow-y-auto pb-24">
        {tab === "orders" ? <Orders profile={profile} jobs={activeJobs} delivered={delivered} busy={busy} onOnline={toggleOnline} onRefresh={hydrate} onNavigate={openNavigation} onAdvance={advance}/> : <NavigationScreen job={selected} riderLocation={location ?? profile?.locations?.[0] ?? null} navigation={navigation} onStop={() => setNavigation(false)} onAdvance={advance} busy={busy} />}
      </main>
      <nav className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-[680px] -translate-x-1/2 border-t border-[#F0E4D6] bg-white px-2 pb-2 pt-2 lg:absolute">
        <button onClick={() => setTab("orders")} className={`flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-black ${tab === "orders" ? "text-[#F4581D]" : "text-[#8A817A]"}`}>🧾<span>Orders</span></button>
        <button onClick={() => setTab("map")} className={`flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-black ${tab === "map" ? "text-[#F4581D]" : "text-[#8A817A]"}`}>🗺️<span>Map</span></button>
        <button className="flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-black text-[#8A817A]">📊<span>Earnings</span></button>
        <button className="flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-black text-[#8A817A]">👤<span>Profile</span></button>
      </nav>
    </div>
  </div>;
}

function Orders({ profile, jobs, delivered, busy, onOnline, onRefresh, onNavigate, onAdvance }: { profile: Profile | null; jobs: Job[]; delivered: Job[]; busy: boolean; onOnline: () => void; onRefresh: () => void; onNavigate: (job: Job) => void; onAdvance: (job: Job) => void }) {
  return <div className="pt-5">
    <div className="mx-5 rounded-full bg-white px-4 py-3 shadow-sm ring-1 ring-[#F0E4D6]"><div className="flex items-center justify-between"><button disabled={busy} onClick={onOnline} className={`rounded-full px-3 py-1.5 text-xs font-black ${profile?.status === "online" ? "bg-[#E4F6EB] text-[#1FA35A]" : "bg-[#F6EEE7] text-[#8A817A]"}`}>{profile?.status === "online" ? "● Online" : "○ Offline"}</button><span className="text-[11px] font-bold text-[#8A817A]">{jobs.length} active · {(profile?.rating ?? 5).toFixed(1)} ⭐</span></div></div>
    <div className="mt-3 flex gap-3 px-5"><Stat value={String(jobs.length)} label="Active Orders"/><Stat value={String(profile?.completedJobs ?? 0)} label="Completed"/><Stat value={`${(profile?.rating ?? 5).toFixed(1)} ⭐`} label="Rider Rating"/></div>
    <Title text="Active Orders" count={jobs.length}/>
    {jobs.length ? jobs.map(job => <OrderCard key={job.id} job={job} busy={busy} onNavigate={onNavigate} onAdvance={onAdvance}/>) : <div className="mx-5 rounded-[22px] bg-white p-7 text-center shadow-sm ring-1 ring-[#F0E4D6]"><div className="text-3xl">🥟</div><div className="mt-2 text-sm font-black">{profile?.status === "online" ? "Waiting for an order" : "You're offline"}</div><div className="mt-1 text-xs leading-5 text-[#8A817A]">{profile?.status === "online" ? "Dispatch will notify you when a delivery is assigned." : "Go online when you're ready to receive deliveries."}</div></div>}
    <Title text="Recent Orders"/>
    <div className="mx-5 rounded-[22px] bg-white shadow-sm ring-1 ring-[#F0E4D6]">{delivered.length ? delivered.slice(0, 6).map((j,i) => <div key={j.id} className={`flex items-center gap-3 px-4 py-3.5 ${i === Math.min(5, delivered.length - 1) ? "" : "border-b border-[#F0E4D6]"}`}><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFE3D2] text-xl">🥟</div><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-black">{j.order?.customer.name ?? "Customer"}</div><div className="truncate text-[11px] text-[#8A817A]">{j.dropoffAddress}</div></div><div className="text-right"><div className="text-xs font-black text-[#1FA35A]">₱{Number(j.finalFare ?? j.estimatedFare ?? 0).toFixed(0)}</div><div className="text-[10px] text-[#8A817A]">Delivered</div></div></div>) : <div className="p-5 text-center text-xs text-[#8A817A]">No deliveries completed yet.</div>}</div>
    <button onClick={onRefresh} className="mx-5 mt-3 flex w-[calc(100%-40px)] items-center justify-center gap-2 rounded-2xl bg-white py-3 text-xs font-black text-[#5C5450] ring-1 ring-[#F0E4D6]"><RefreshCw size={14}/> Refresh</button>
  </div>;
}

function OrderCard({ job, busy, onNavigate, onAdvance }: { job: Job; busy: boolean; onNavigate: (job: Job) => void; onAdvance: (job: Job) => void }) {
  const fare = Number(job.finalFare ?? job.estimatedFare ?? 0); const toDropoff = ["picked_up", "delivering"].includes(job.status); const address = toDropoff ? job.dropoffAddress : job.pickupAddress;
  return <div className="mx-5 mb-3 rounded-[22px] border-[1.5px] border-[#F4581D] bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between"><span className="rounded-[10px] bg-[#FFE3D2] px-2.5 py-1.5 text-[11px] font-extrabold text-[#D9430F]">{job.status === "assigned" ? "🕐 New Order" : "🚴 Current Order"}</span><span className="text-xs font-extrabold text-[#8A817A]">#{job.order?.orderNumber ?? job.id.slice(-6).toUpperCase()}</span></div>
    <div className="mt-4 flex items-start gap-3.5"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFE3D2] text-[26px]">🥟</div><div className="min-w-0 flex-1"><div className="text-[15px] font-extrabold">👤 {job.order?.customer.name ?? "Customer"}</div><div className="mt-1 text-[13px] leading-[18px] text-[#5C5450]">📍 {address}</div></div></div>
    <div className="mt-4 flex gap-2"><div className="flex-1"><div className="text-[19px] font-black">₱{fare.toFixed(0)}</div>{job.order?.quantity ? <div className="text-[11px] text-[#8A817A]">{job.order.quantity} pcs Empanada</div> : null}</div><button disabled={busy} onClick={() => onNavigate(job)} className="rounded-2xl border border-[#F4581D] bg-white px-4 py-3 text-[12px] font-black text-[#F4581D]"><Navigation size={14} className="mr-1 inline"/>Navigate</button><button disabled={busy || !NEXT[job.status]} onClick={() => onAdvance(job)} className="rounded-2xl bg-[#F4581D] px-4 py-3 text-[12px] font-black text-white">{busy ? "Updating…" : LABEL[job.status] ?? "Open Order"}</button></div>
    {job.order?.customer.phoneNumber ? <a href={`tel:${job.order.customer.phoneNumber}`} className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#F6EEE7] py-2 text-xs font-black text-[#5C5450]"><Phone size={13}/> Call customer</a> : null}
  </div>;
}

function NavigationScreen({ job, riderLocation, navigation, onStop, onAdvance, busy }: { job: Job | null; riderLocation: Coordinate | null; navigation: boolean; onStop: () => void; onAdvance: (job: Job) => void; busy: boolean }) {
  const leafletReady = useLeaflet();
  const [route, setRoute] = useState<RouteData | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [map, setMap] = useState<any>(null);
  const [mapEl, setMapEl] = useState<HTMLDivElement | null>(null);

  const destination = useMemo(() => {
    if (!job) return null;
    const toDropoff = ["picked_up", "delivering"].includes(job.status);
    const point = toDropoff ? [job.dropoffLatitude, job.dropoffLongitude] : [job.pickupLatitude, job.pickupLongitude];
    return valid({ latitude: Number(point[0]), longitude: Number(point[1]) }) ? { latitude: Number(point[0]), longitude: Number(point[1]) } : null;
  }, [job]);

  useEffect(() => {
    if (!leafletReady || !mapEl || map) return;
    const L = window.L; if (!L) return;
    const m = L.map(mapEl, { zoomControl: false }).setView([10.3157, 123.8854], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    setMap(m); setTimeout(() => m.invalidateSize(), 100);
    return () => { m.remove(); };
  }, [leafletReady, mapEl, map]);

  useEffect(() => {
    if (!map || !riderLocation || !destination) return;
    let cancelled = false;
    setRouteError(null);
    const url = `https://router.project-osrm.org/route/v1/driving/${riderLocation.longitude},${riderLocation.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=true`;
    fetch(url).then(r => r.ok ? r.json() : Promise.reject(new Error("Routing service unavailable"))).then(data => {
      if (cancelled) return;
      const r = data.routes?.[0] as RouteData | undefined; if (!r) throw new Error("No driving route found");
      setRoute(r);
    }).catch(e => { if (!cancelled) setRouteError(e instanceof Error ? e.message : "Unable to calculate route"); });
    return () => { cancelled = true; };
  }, [map, riderLocation, destination]);

  useEffect(() => {
    if (!map || !window.L) return;
    const L = window.L; map.eachLayer((layer: any) => { if (layer.options?.pane === "overlayPane" || layer instanceof L.Marker) map.removeLayer(layer); });
    if (riderLocation) L.marker([riderLocation.latitude, riderLocation.longitude], { icon: L.divIcon({ className: "rider-live", html: `<div style="width:38px;height:38px;border-radius:50%;background:#F4581D;border:4px solid white;box-shadow:0 3px 14px rgba(0,0,0,.3);display:grid;place-items:center;font-size:18px">🏍️</div>`, iconSize: [38,38], iconAnchor: [19,19] }) }).addTo(map);
    if (destination) L.marker([destination.latitude, destination.longitude], { icon: L.divIcon({ className: "dest", html: `<div style="width:36px;height:36px;border-radius:12px;background:#241C18;border:3px solid white;display:grid;place-items:center;color:white;font-size:17px">📍</div>`, iconSize: [36,36], iconAnchor: [18,18] }) }).addTo(map);
    if (route?.geometry?.coordinates?.length) {
      const latLngs = route.geometry.coordinates.map(([lng,lat]) => [lat,lng]);
      L.polyline(latLngs, { color: "#F4581D", weight: 8, opacity: .9, lineCap: "round", lineJoin: "round" }).addTo(map);
      map.fitBounds(L.latLngBounds(latLngs), { padding: [55, 120], maxZoom: 17 });
    } else if (riderLocation) map.setView([riderLocation.latitude, riderLocation.longitude], 16);
  }, [map, riderLocation, destination, route]);

  const nextInstruction = route?.legs?.[0]?.steps?.find(step => (step.distance ?? 0) > 20)?.maneuver?.instruction ?? "Follow the highlighted route";
  const minutes = route ? Math.max(1, Math.round(route.duration / 60)) : job?.estimatedDurationMinutes ?? null;
  const km = route ? route.distance / 1000 : job?.distanceKm ?? null;

  return <div className={navigation ? "fixed inset-0 z-[100] bg-[#101418]" : "pt-3"}>
    <div className={navigation ? "absolute inset-0" : "mx-5 overflow-hidden rounded-[22px] shadow-sm ring-1 ring-[#F0E4D6]"} style={navigation ? undefined : { height: "min(62vh, 600px)" }}>
      <div ref={setMapEl} className="h-full w-full bg-slate-300" />
    </div>
    {job ? <>
      <div className="absolute left-4 right-4 top-4 z-[500] rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur"><div className="flex items-center gap-3"><Navigation className="text-[#F4581D]" size={22}/><div className="min-w-0 flex-1"><div className="text-[11px] font-black uppercase tracking-wider text-[#8A817A]">{["picked_up","delivering"].includes(job.status) ? "Delivering to" : "Heading to pickup"}</div><div className="truncate text-sm font-black">{["picked_up","delivering"].includes(job.status) ? job.dropoffAddress : job.pickupAddress}</div></div><button onClick={onStop} className="rounded-xl bg-[#F6EEE7] px-3 py-2 text-xs font-black">Close</button></div></div>
      {navigation && <div className="absolute bottom-4 left-4 right-4 z-[500] rounded-[24px] bg-white p-4 shadow-2xl"><div className="text-[18px] font-black">{nextInstruction}</div><div className="mt-2 flex gap-3 text-xs font-bold text-[#5C5450]"><span>{km != null ? `${km.toFixed(1)} km` : "Calculating…"}</span><span>·</span><span>{minutes != null ? `${minutes} min` : "Route"}</span></div><div className="mt-3 flex gap-2"><button onClick={() => riderLocation && map?.setView([riderLocation.latitude, riderLocation.longitude], 17)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#F6EEE7] py-3 text-xs font-black"><LocateFixed size={15}/> My location</button><button disabled={busy || !NEXT[job.status]} onClick={() => onAdvance(job)} className="flex-[1.5] rounded-2xl bg-[#F4581D] py-3 text-xs font-black text-white">{busy ? "Updating…" : LABEL[job.status]}</button></div></div>}
      {!navigation && <div className="mx-5 mt-3 rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-[#F0E4D6]"><div className="flex items-center justify-between"><div><div className="text-sm font-black">{job.order?.customer.name ?? "Customer"}</div><div className="text-xs text-[#8A817A]">{job.order?.orderNumber ?? job.id.slice(-6).toUpperCase()}</div></div><button onClick={() => {}} className="rounded-xl bg-[#F6EEE7] px-3 py-2 text-xs font-black">Start navigation</button></div>{routeError ? <div className="mt-2 text-xs font-semibold text-[#A43D1D]">{routeError}</div> : null}</div>}
    </> : <div className="mx-5 mt-5 rounded-[22px] bg-white p-6 text-center text-sm font-bold">Select an active order to navigate.</div>}
  </div>;
}

function Stat({ value, label }: { value: string; label: string }) { return <div className="flex-1 rounded-[18px] bg-white p-3 text-center shadow-sm ring-1 ring-[#F0E4D6]"><div className="text-[17px] font-black">{value}</div><div className="mt-0.5 text-[10px] text-[#8A817A]">{label}</div></div>; }
function Title({ text, count }: { text: string; count?: number }) { return <div className="mt-6 mb-3 flex items-center justify-between px-5"><div className="text-[15px] font-black">{text}</div>{count != null ? <div className="rounded-full bg-[#FFE3D2] px-2.5 py-1 text-[10px] font-black text-[#D9430F]">{count}</div> : null}</div>; }
