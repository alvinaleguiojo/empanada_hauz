"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bell, Clock3, LocateFixed, Navigation, Phone, RefreshCw, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Coordinate = { latitude: number; longitude: number };
type Profile = { id: string; status: "offline" | "online" | "busy" | "suspended"; rating: number; completedJobs: number; user: { name: string; email: string; role: string }; locations: Coordinate[] };
type Job = { id: string; status: string; pickupAddress: string; pickupLatitude?: number | null; pickupLongitude?: number | null; dropoffAddress: string; dropoffLatitude?: number | null; dropoffLongitude?: number | null; estimatedFare?: number | null; finalFare?: number | null; estimatedDurationMinutes?: number | null; distanceKm?: number | null; order?: { orderNumber: string; quantity?: number; customer: { name: string; phoneNumber?: string | null } } | null };
type RouteStep = { distance?: number; duration?: number; name?: string; maneuver?: { type?: string; modifier?: string } };
type Route = { distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] }; legs?: { steps?: RouteStep[] }[] };

declare global { interface Window { L?: any } }

const ACTIVE = ["requested", "searching_rider", "assigned", "accepted", "pickup_started", "picked_up", "delivering"];
const NEXT: Record<string, string> = { assigned: "accepted", accepted: "pickup_started", pickup_started: "picked_up", picked_up: "delivering", delivering: "delivered" };
const LABEL: Record<string, string> = { assigned: "Go to Pickup", accepted: "Confirm Pickup", pickup_started: "Confirm Pickup", picked_up: "Start Delivery", delivering: "Complete Delivery" };

function stepText(step?: RouteStep) {
  if (!step) return "Continue to destination";
  const modifier = step.maneuver?.modifier?.replace(/-/g, " ");
  const type = step.maneuver?.type;
  const road = step.name ? ` onto ${step.name}` : "";
  if (type === "arrive") return "Arrive at destination";
  if (type === "depart") return `Head ${modifier ?? "forward"}${road}`;
  if (type === "roundabout" || type === "rotary") return `Enter roundabout${modifier ? `, ${modifier}` : ""}${road}`;
  if (type === "merge") return `Merge ${modifier ?? "ahead"}${road}`;
  if (type === "fork") return `Keep ${modifier ?? "ahead"}${road}`;
  if (type === "on ramp" || type === "off ramp") return `${type === "on ramp" ? "Take" : "Take the"} ramp${modifier ? ` ${modifier}` : ""}${road}`;
  if (type === "new name") return `Continue${road}`;
  if (type === "continue") return `Continue ${modifier ?? "ahead"}${road}`;
  if (type === "turn") return `Turn ${modifier ?? "ahead"}${road}`;
  return `${type ? type.replace(/_/g, " ") : "Continue"}${modifier ? ` ${modifier}` : ""}${road}`;
}

function formatEta(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(timestamp);
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

export function RiderAppV6() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [heading, setHeading] = useState(0);
  const [tab, setTab] = useState<"orders" | "map">("orders");
  const [navigating, setNavigating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    const [nextProfile, nextJobs] = await Promise.all([apiFetch<Profile>("/rider/me"), apiFetch<Job[]>("/rider/jobs")]);
    setProfile(nextProfile);
    setJobs(nextJobs);
    const current = selectedId && nextJobs.some(job => job.id === selectedId) ? selectedId : nextJobs.find(job => ACTIVE.includes(job.status))?.id ?? null;
    const delivering = nextJobs.find(job => job.status === "delivering");
    setSelectedId(delivering?.id ?? current);
    if (delivering) {
      setTab("map");
      setNavigating(true);
    }
  }, [selectedId]);

  useEffect(() => { hydrate().catch(e => setError(e instanceof Error ? e.message : "Unable to load rider data")); }, [hydrate]);
  useEffect(() => {
    if (!profile || profile.status === "offline" || profile.status === "suspended" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(position => {
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setLocation(coords);
      if (position.coords.heading != null && position.coords.heading >= 0) setHeading(position.coords.heading);
      void apiFetch("/rider/location", { method: "POST", body: JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, heading: position.coords.heading ?? undefined, speed: position.coords.speed ?? undefined }) }).catch(() => undefined);
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [profile?.status]);

  const activeJobs = useMemo(() => jobs.filter(job => ACTIVE.includes(job.status)), [jobs]);
  const deliveredJobs = useMemo(() => jobs.filter(job => job.status === "delivered"), [jobs]);
  const selectedJob = jobs.find(job => job.id === selectedId) ?? activeJobs[0] ?? null;

  async function toggleOnline() {
    if (!profile || profile.status === "suspended") return;
    setBusy(true); setError(null);
    try { setProfile(await apiFetch<Profile>("/rider/status", { method: "PATCH", body: JSON.stringify({ status: profile.status === "online" ? "offline" : "online" }) })); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to update status"); }
    finally { setBusy(false); }
  }

  async function advance(job: Job) {
    const nextStatus = NEXT[job.status]; if (!nextStatus) return;
    setBusy(true); setError(null);
    try { await apiFetch(`/rider/jobs/${job.id}/status`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) }); await hydrate(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to update order"); }
    finally { setBusy(false); }
  }

  function openNavigation(job: Job) { setSelectedId(job.id); setTab("map"); setNavigating(true); }

  return <div className="min-h-[100dvh] bg-[#FFF6EC] text-[#241C18] -mx-4 -my-6 lg:-mx-8 lg:-my-8">
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[680px] flex-col bg-[#FFF6EC] lg:border-x lg:border-[#F0E4D6]">
      <header className="rounded-b-[30px] bg-[#F4581D] px-5 py-5 text-white"><div className="flex items-center justify-between"><button onClick={() => { setTab("orders"); setNavigating(false); }} className="flex h-10 w-10 items-center justify-center" aria-label="Back"><ArrowLeft size={22}/></button><div className="text-center"><div className="text-[15px] font-extrabold italic">Empanada</div><div className="text-[17px] font-black italic text-[#3B140A]">Hauz Rider</div></div><Bell size={21}/></div></header>
      {error ? <div className="mx-5 mt-3 rounded-2xl border border-[#F3D2B6] bg-[#FFF0E3] px-4 py-3 text-xs font-semibold text-[#8A3E1D]">{error}</div> : null}
      <main className="flex-1 overflow-y-auto pb-24">{tab === "orders" ? <Orders profile={profile} jobs={activeJobs} delivered={deliveredJobs} busy={busy} onOnline={toggleOnline} onRefresh={hydrate} onNavigate={openNavigation} onAdvance={advance}/> : selectedJob ? <NavigationScreen job={selectedJob} riderLocation={location ?? profile?.locations?.[0] ?? null} heading={heading} navigating={navigating} onBack={() => { setTab("orders"); setNavigating(false); }} onAdvance={advance} busy={busy}/> : <div className="mx-5 mt-5 rounded-[22px] bg-white p-6 text-center text-sm font-bold ring-1 ring-[#F0E4D6]">Select an active order to navigate.</div>}</main>
      <nav className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-[680px] -translate-x-1/2 border-t border-[#F0E4D6] bg-white px-2 pb-2 pt-2"><button onClick={() => { setTab("orders"); setNavigating(false); }} className={`flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-black ${tab === "orders" ? "text-[#F4581D]" : "text-[#8A817A]"}`}>🧾<span>Orders</span></button><button onClick={() => setTab("map")} className={`flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-black ${tab === "map" ? "text-[#F4581D]" : "text-[#8A817A]"}`}>🗺️<span>Map</span></button><button className="flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-black text-[#8A817A]">📊<span>Earnings</span></button><button className="flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-black text-[#8A817A]">👤<span>Profile</span></button></nav>
    </div>
  </div>;
}

function Orders({ profile, jobs, delivered, busy, onOnline, onRefresh, onNavigate, onAdvance }: { profile: Profile | null; jobs: Job[]; delivered: Job[]; busy: boolean; onOnline: () => void; onRefresh: () => void; onNavigate: (job: Job) => void; onAdvance: (job: Job) => void }) {
  return <div className="pt-5"><div className="mx-5 flex items-center justify-between rounded-full bg-white px-4 py-3 shadow-sm ring-1 ring-[#F0E4D6]"><button disabled={busy} onClick={onOnline} className={`rounded-full px-3 py-1.5 text-xs font-black ${profile?.status === "online" ? "bg-[#E4F6EB] text-[#1FA35A]" : "bg-[#F6EEE7] text-[#8A817A]"}`}>{profile?.status === "online" ? "● Online" : "○ Offline"}</button><span className="text-[11px] font-bold text-[#8A817A]">{jobs.length} active · {(profile?.rating ?? 5).toFixed(1)} ⭐</span></div><div className="mt-3 flex gap-3 px-5"><Stat value={String(jobs.length)} label="Active Orders"/><Stat value={String(profile?.completedJobs ?? 0)} label="Completed"/><Stat value={`${(profile?.rating ?? 5).toFixed(1)} ⭐`} label="Rider Rating"/></div><Title text="Active Orders" count={jobs.length}/>{jobs.length ? jobs.map(job => <OrderCard key={job.id} job={job} busy={busy} onNavigate={onNavigate} onAdvance={onAdvance}/>) : <div className="mx-5 rounded-[22px] bg-white p-7 text-center ring-1 ring-[#F0E4D6]"><div className="text-3xl">🥟</div><div className="mt-2 text-sm font-black">{profile?.status === "online" ? "Waiting for an order" : "You're offline"}</div></div>}<Title text="Recent Orders"/><div className="mx-5 rounded-[22px] bg-white ring-1 ring-[#F0E4D6]">{delivered.length ? delivered.slice(0, 8).map((job, index) => <div key={job.id} className={`flex items-center gap-3 px-4 py-3.5 ${index < delivered.length - 1 ? "border-b border-[#F0E4D6]" : ""}`}><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFE3D2] text-xl">🥟</div><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-black">{job.order?.customer.name ?? "Customer"}</div><div className="truncate text-[11px] text-[#8A817A]">{job.dropoffAddress}</div></div><div className="text-right"><div className="text-xs font-black text-[#1FA35A]">₱{Number(job.finalFare ?? job.estimatedFare ?? 0).toFixed(0)}</div><div className="text-[10px] text-[#8A817A]">Delivered</div></div></div>) : <div className="p-5 text-center text-xs text-[#8A817A]">No deliveries completed yet.</div>}</div><button onClick={onRefresh} className="mx-5 mt-3 flex w-[calc(100%-40px)] items-center justify-center gap-2 rounded-2xl bg-white py-3 text-xs font-black ring-1 ring-[#F0E4D6]"><RefreshCw size={14}/>Refresh</button></div>;
}

function OrderCard({ job, busy, onNavigate, onAdvance }: { job: Job; busy: boolean; onNavigate: (job: Job) => void; onAdvance: (job: Job) => void }) {
  const dropoff = job.status === "picked_up" || job.status === "delivering";
  const fare = Number(job.finalFare ?? job.estimatedFare ?? 0);
  const destinationLabel = dropoff ? "Customer" : "Pickup";
  return <div className="mx-5 mb-3 rounded-[22px] border-[1.5px] border-[#F4581D] bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="rounded-[10px] bg-[#FFE3D2] px-2.5 py-1.5 text-[11px] font-extrabold text-[#D9430F]">{job.status === "delivering" ? "🧭 Navigating" : job.status === "assigned" ? "🕐 New Order" : "🚴 Current Order"}</span><span className="text-xs font-extrabold text-[#8A817A]">#{job.order?.orderNumber ?? job.id.slice(-6).toUpperCase()}</span></div><div className="mt-4 flex items-start gap-3.5"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFE3D2] text-[26px]">🥟</div><div className="min-w-0 flex-1"><div className="text-[15px] font-extrabold">👤 {job.order?.customer.name ?? "Customer"}</div><div className="mt-1 text-[13px] leading-[18px] text-[#5C5450]">📍 {destinationLabel}: {dropoff ? job.dropoffAddress : job.pickupAddress}</div></div></div><div className="mt-4 flex gap-2"><div className="flex-1"><div className="text-[19px] font-black">₱{fare.toFixed(0)}</div>{job.order?.quantity ? <div className="text-[11px] text-[#8A817A]">{job.order.quantity} pcs Empanada</div> : null}</div><button disabled={busy} onClick={() => onNavigate(job)} className="rounded-2xl border border-[#F4581D] bg-white px-3 py-3 text-[12px] font-black text-[#F4581D]"><Navigation size={14} className="mr-1 inline"/>Navigate</button><button disabled={busy || !NEXT[job.status]} onClick={() => onAdvance(job)} className="rounded-2xl bg-[#F4581D] px-3 py-3 text-[12px] font-black text-white">{busy ? "Updating…" : LABEL[job.status] ?? "Open Order"}</button></div>{job.order?.customer.phoneNumber ? <a href={`tel:${job.order.customer.phoneNumber}`} className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#F6EEE7] py-2 text-xs font-black text-[#5C5450]"><Phone size={13}/>Call customer</a> : null}</div>;
}

function Title({ text, count }: { text: string; count?: number }) { return <div className="mt-6 mb-3 flex items-center justify-between px-5"><div className="text-[15px] font-black">{text}</div>{count !== undefined ? <div className="rounded-full bg-[#FFE3D2] px-2.5 py-1 text-[10px] font-black text-[#D9430F]">{count}</div> : null}</div>; }
function Stat({ value, label }: { value: string; label: string }) { return <div className="flex-1 rounded-[18px] bg-white p-3 text-center ring-1 ring-[#F0E4D6]"><div className="text-[17px] font-black">{value}</div><div className="mt-0.5 text-[10px] text-[#8A817A]">{label}</div></div>; }

function NavigationScreen({ job, riderLocation, heading, navigating, onBack, onAdvance, busy }: { job: Job; riderLocation: Coordinate | null; heading: number; navigating: boolean; onBack: () => void; onAdvance: (job: Job) => void; busy: boolean }) {
  const leafletReady = useLeaflet();
  const mapRef = useRef<any>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const riderLocationRef = useRef<Coordinate | null>(riderLocation);
  const [route, setRoute] = useState<Route | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { riderLocationRef.current = riderLocation; }, [riderLocation]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 15000); return () => window.clearInterval(id); }, []);

  const isDropoff = job.status === "picked_up" || job.status === "delivering";
  const destination = useMemo<Coordinate | null>(() => {
    const latitude = Number(isDropoff ? job.dropoffLatitude : job.pickupLatitude);
    const longitude = Number(isDropoff ? job.dropoffLongitude : job.pickupLongitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }, [isDropoff, job.dropoffLatitude, job.dropoffLongitude, job.pickupLatitude, job.pickupLongitude]);

  useEffect(() => {
    if (!leafletReady || !mapEl.current || mapRef.current) return;
    const L = window.L; if (!L) return;
    const map = L.map(mapEl.current, { zoomControl: false, attributionControl: true }).setView([10.3157, 123.8854], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapRef.current = null; };
  }, [leafletReady]);

  useEffect(() => {
    if (!destination) return;
    let cancelled = false;
    const calculate = async () => {
      const current = riderLocationRef.current;
      if (!current) return;
      try {
        setRouteError(null);
        const url = `https://router.project-osrm.org/route/v1/driving/${current.longitude},${current.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=true`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Routing service returned ${response.status}`);
        const data = await response.json();
        const nextRoute = data?.routes?.[0] as Route | undefined;
        if (!nextRoute) throw new Error("No driving route found");
        if (!cancelled) setRoute(nextRoute);
      } catch (err) {
        if (!cancelled) setRouteError(err instanceof Error ? err.message : "Unable to calculate route");
      }
    };
    void calculate();
    const id = window.setInterval(() => void calculate(), 8000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [destination]);

  useEffect(() => {
    const map = mapRef.current, L = window.L;
    if (!map || !L) return;
    map.eachLayer((layer: any) => {
      if (layer?.options?.pane === "markerPane" || layer instanceof L.Marker) map.removeLayer(layer);
    });
    if (riderLocation) {
      const icon = L.divIcon({ className: "rider-live", html: `<div style="transform:rotate(${heading}deg);font-size:38px;line-height:38px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))">🏍️</div>`, iconSize: [44,44], iconAnchor: [22,22] });
      L.marker([riderLocation.latitude, riderLocation.longitude], { icon }).addTo(map);
    }
    if (destination) {
      const icon = L.divIcon({ className: "destination", html: '<div style="width:36px;height:36px;border-radius:50%;background:#241C18;border:3px solid white;display:grid;place-items:center;color:white;font-size:17px">📍</div>', iconSize: [36,36], iconAnchor: [18,18] });
      L.marker([destination.latitude, destination.longitude], { icon }).addTo(map);
    }
    const coordinates = route?.geometry?.coordinates;
    if (Array.isArray(coordinates) && coordinates.length > 1) {
      const routePoints: [number, number][] = coordinates.map(([lng, lat]) => [lat, lng]);
      const oldRoute = (map as any).__ehRouteLine;
      if (oldRoute) map.removeLayer(oldRoute);
      (map as any).__ehRouteLine = L.polyline(routePoints, { color: "#F4581D", weight: 7, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(map);
      if (follow && riderLocation) map.setView([riderLocation.latitude, riderLocation.longitude], Math.max(map.getZoom(), 16), { animate: true });
    } else if (follow && riderLocation) {
      map.setView([riderLocation.latitude, riderLocation.longitude], 17, { animate: true });
    }
  }, [destination, heading, riderLocation, route, follow]);

  const steps = route?.legs?.[0]?.steps ?? [];
  const nextStep = steps.find(step => (step.distance ?? 0) > 20) ?? steps[0];
  const kilometers = route?.distance != null ? route.distance / 1000 : job.distanceKm ?? null;
  const minutes = route?.duration != null ? Math.max(1, Math.round(route.duration / 60)) : job.estimatedDurationMinutes ?? null;
  const etaTime = minutes != null ? now + minutes * 60 * 1000 : null;
  const nextTurnDistance = nextStep?.distance != null ? (nextStep.distance >= 1000 ? `${(nextStep.distance / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(nextStep.distance / 10) * 10)} m`) : null;

  return <div className={navigating ? "fixed inset-0 z-[100] bg-[#111]" : "pt-3"}>
    <div ref={mapEl} className={navigating ? "absolute inset-0" : "mx-5 h-[min(62vh,600px)] overflow-hidden rounded-[22px] bg-slate-200 shadow-sm"} />
    {navigating ? <div className="absolute left-3 right-3 top-3 z-[500] rounded-[24px] bg-white/96 p-3 shadow-2xl backdrop-blur"><div className="flex items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F4581D] text-white"><Navigation size={24}/></div><div className="min-w-0 flex-1"><div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8A817A]">{isDropoff ? "Next · Deliver to customer" : "Next · Go to pickup"}</div><div className="text-lg font-black leading-6">{stepText(nextStep)}</div>{nextTurnDistance ? <div className="mt-0.5 text-xs font-bold text-[#5C5450]">{nextTurnDistance} to this maneuver</div> : null}</div><button onClick={onBack} className="rounded-xl bg-[#F6EEE7] px-3 py-2 text-xs font-black">Close</button></div></div> : null}
    {navigating ? <div className="absolute bottom-3 left-3 right-3 z-[500] rounded-[26px] bg-white p-4 shadow-2xl"><div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#FFF6EC] p-3"><div><div className="text-[10px] font-black uppercase tracking-wider text-[#8A817A]">Arrive</div><div className="mt-1 text-xl font-black">{etaTime ? formatEta(etaTime) : "—"}</div></div><div><div className="text-[10px] font-black uppercase tracking-wider text-[#8A817A]">ETA</div><div className="mt-1 text-xl font-black">{minutes != null ? `${minutes} min` : "—"}</div></div><div><div className="text-[10px] font-black uppercase tracking-wider text-[#8A817A]">Distance</div><div className="mt-1 text-xl font-black">{kilometers != null ? `${kilometers.toFixed(1)} km` : "—"}</div></div></div>{routeError ? <div className="mt-2 rounded-xl bg-[#FFF0E3] px-3 py-2 text-xs font-semibold text-[#A43D1D]">{routeError}</div> : null}<div className="mt-3 grid grid-cols-[1fr_1.6fr_1fr] gap-2"><button onClick={() => { setFollow(true); if (riderLocation) mapRef.current?.setView([riderLocation.latitude, riderLocation.longitude], 17, { animate: true }); }} className="flex items-center justify-center gap-2 rounded-2xl bg-[#F6EEE7] py-3 text-xs font-black"><LocateFixed size={15}/>Recenter</button><button disabled={busy || !NEXT[job.status]} onClick={() => onAdvance(job)} className="rounded-2xl bg-[#F4581D] py-3 text-xs font-black text-white">{busy ? "Updating…" : LABEL[job.status]}</button><button onClick={() => { setFollow(true); if (mapRef.current && riderLocation) mapRef.current.setView([riderLocation.latitude, riderLocation.longitude], 17, { animate: true }); }} className="flex items-center justify-center gap-2 rounded-2xl border border-[#F0E4D6] py-3 text-xs font-black"><RotateCcw size={15}/>Follow</button></div><button onClick={() => setFollow(value => !value)} className="mt-2 w-full text-center text-[11px] font-black text-[#8A817A]">{follow ? "Live follow ON · map stays centered on rider" : "Live follow OFF · tap to follow"}</button></div> : null}
    {!navigating ? <div className="mx-5 mt-3 rounded-[22px] bg-white p-4 ring-1 ring-[#F0E4D6]"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFE3D2] text-[#F4581D]"><Clock3 size={20}/></div><div className="min-w-0 flex-1"><div className="text-sm font-black">{job.order?.customer.name ?? "Customer"}</div><div className="mt-1 text-xs text-[#8A817A]">{kilometers != null ? `${kilometers.toFixed(1)} km` : "Route"} · {minutes != null ? `${minutes} min` : "Calculating…"}{etaTime ? ` · ETA ${formatEta(etaTime)}` : ""}</div></div></div><button onClick={() => setFollow(true)} className="mt-3 w-full rounded-2xl bg-[#F4581D] py-3 text-xs font-black text-white">Start navigation</button></div> : null}
  </div>;
}
