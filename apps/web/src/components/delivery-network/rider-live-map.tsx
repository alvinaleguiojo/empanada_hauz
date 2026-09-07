"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Radio, X, Gauge, Clock3, CarFront, Navigation } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { socket } from "@/lib/socket";
import { Card } from "@/components/ui/card";

type Rider = { id: string; phoneNumber?: string | null; status: string; user: { name: string; email: string }; vehicles: Array<{ type: string; plateNumber?: string | null; model?: string | null }>; locations: Array<{ latitude: number; longitude: number; heading?: number | null; speed?: number | null; accuracy?: number | null; createdAt: string }> };
type DeliveryJob = { id: string; status: string; riderId?: string | null; pickupAddress: string; pickupLatitude?: number | null; pickupLongitude?: number | null; dropoffAddress: string; dropoffLatitude?: number | null; dropoffLongitude?: number | null; distanceKm?: number | null; estimatedDurationMinutes?: number | null; estimatedFare: number; finalFare?: number | null; order?: { orderNumber: string; customer: { name: string; phoneNumber?: string | null } } | null };
type RiderLocationEvent = { riderId: string; latitude: number; longitude: number; heading?: number | null; speed?: number | null; accuracy?: number | null; createdAt: string };
type GoogleMapsWindow = Window & { google?: { maps?: any } };

const RIDER_ORANGE = "#F4581D";
const RIDER_RED = "#D5473A";
const RIDER_MAP_BACKGROUND = "#E8EDF2";
const DEFAULT_CENTER = { lat: 10.3157, lng: 123.8854 };
const STALE_AFTER_MS = 45_000;
const MAX_ACCEPTABLE_ACCURACY_METERS = 100;
const ACTIVE_ROUTE_STATUSES = new Set(["requested", "searching_rider", "assigned", "accepted", "pickup_started", "picked_up", "delivering"]);

function validCoordinate(l?: Rider["locations"][number]) { return !!l && Number.isFinite(l.latitude) && Number.isFinite(l.longitude); }
function isFresh(l?: Rider["locations"][number]) { if (!validCoordinate(l)) return false; if (l!.accuracy != null && l!.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) return false; const age = Date.now() - new Date(l!.createdAt).getTime(); return Number.isFinite(age) && age >= 0 && age <= STALE_AFTER_MS; }
function point(value?: { latitude?: number | null; longitude?: number | null } | null) { return value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude)) ? { lat: Number(value.latitude), lng: Number(value.longitude) } : null; }
function formatAge(createdAt: string) { const seconds = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 1000)); return seconds < 5 ? "just now" : `${seconds}s ago`; }
function riderCircleIcon(maps: any) { return { path: maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#FFFFFF", fillOpacity: 1, strokeColor: RIDER_ORANGE, strokeWeight: 3 }; }
function endpointIcon(maps: any, kind: "Pickup" | "Drop-off") { return { path: maps.SymbolPath.CIRCLE, scale: 13, fillColor: kind === "Pickup" ? RIDER_ORANGE : RIDER_RED, fillOpacity: 1, strokeColor: "#FFFFFF", strokeWeight: 3 }; }
function regionFor(points: Array<{ lat: number; lng: number }>) {
  if (!points.length) return { center: DEFAULT_CENTER, zoom: 12 };
  const lats = points.map((p) => p.lat); const lngs = points.map((p) => p.lng);
  const latDelta = Math.max(0.015, (Math.max(...lats) - Math.min(...lats)) * 1.6);
  const lngDelta = Math.max(0.015, (Math.max(...lngs) - Math.min(...lngs)) * 1.6);
  const span = Math.max(latDelta, lngDelta);
  return { center: { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 }, zoom: Math.max(10, Math.min(17, Math.round(Math.log2(360 / span)))) };
}

export function RiderLiveMap({ initialRiders, initialJobs = [] }: { initialRiders: Rider[]; initialJobs?: DeliveryJob[] }) {
  const [riders, setRiders] = useState(initialRiders); const [jobs, setJobs] = useState(initialJobs); const [mapsReady, setMapsReady] = useState(false); const [lastUpdate, setLastUpdate] = useState<string | null>(null); const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null); const [routeError, setRouteError] = useState<string | null>(null);
  const mapElementRef = useRef<HTMLDivElement | null>(null); const mapRef = useRef<any>(null); const directionsRef = useRef<any>(null); const markersRef = useRef<Record<string, any>>({}); const endpointMarkersRef = useRef<any[]>([]); const listenersRef = useRef<Record<string, any>>({}); const realtimeAtRef = useRef<Record<string, number>>({}); const hasFitBoundsRef = useRef(false);
  const ridersWithLocation = useMemo(() => riders.filter((r) => isFresh(r.locations[0])), [riders]);
  const ridersWithKnownLocation = useMemo(() => riders.filter((r) => validCoordinate(r.locations[0])), [riders]);
  const selectedRider = useMemo(() => riders.find((r) => r.id === selectedRiderId) ?? null, [riders, selectedRiderId]);
  const initialRegion = useMemo(() => regionFor(ridersWithLocation.map((r) => ({ lat: r.locations[0].latitude, lng: r.locations[0].longitude }))), [ridersWithLocation]);

  useEffect(() => {
    let cancelled = false; let timer: number | null = null; let attempts = 0;
    const ready = () => { if (cancelled) return; const m = (window as GoogleMapsWindow).google?.maps; if (m?.Map && m.Marker && m.LatLngBounds && m.SymbolPath && m.DirectionsService && m.DirectionsRenderer) return setMapsReady(true); if (attempts++ < 120) timer = window.setTimeout(ready, 250); };
    ready(); return () => { cancelled = true; if (timer !== null) window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!mapsReady || !mapElementRef.current || mapRef.current) return;
    const m = (window as GoogleMapsWindow).google!.maps;
    mapRef.current = new m.Map(mapElementRef.current, { center: initialRegion.center, zoom: initialRegion.zoom, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, backgroundColor: RIDER_MAP_BACKGROUND });
    directionsRef.current = new m.DirectionsRenderer({ map: mapRef.current, suppressMarkers: true, polylineOptions: { strokeColor: RIDER_ORANGE, strokeOpacity: 0.95, strokeWeight: 5 } });
  }, [mapsReady, initialRegion.center.lat, initialRegion.center.lng, initialRegion.zoom]);

  useEffect(() => {
    const onLocation = (p: RiderLocationEvent) => { if (!p?.riderId || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || !p.createdAt) return; const age = Date.now() - new Date(p.createdAt).getTime(); if (!Number.isFinite(age) || age < -10_000 || age > STALE_AFTER_MS || (p.accuracy != null && p.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS)) return; realtimeAtRef.current[p.riderId] = Date.now(); setRiders((cur) => cur.map((r) => r.id === p.riderId ? { ...r, locations: [{ latitude: p.latitude, longitude: p.longitude, heading: p.heading, speed: p.speed, accuracy: p.accuracy, createdAt: p.createdAt }] } : r)); setLastUpdate(p.createdAt); };
    const onRider = (p: Rider) => { if (!p?.id) return; setRiders((cur) => { const i = cur.findIndex((r) => r.id === p.id); if (i < 0) return [...cur, p]; const next = [...cur]; const live = !!realtimeAtRef.current[p.id] && Date.now() - realtimeAtRef.current[p.id] < STALE_AFTER_MS; next[i] = { ...next[i], ...p, locations: live ? next[i].locations : (p.locations?.length ? p.locations : next[i].locations) }; return next; }); };
    const onJobs = (payload: DeliveryJob | DeliveryJob[]) => { if (Array.isArray(payload)) setJobs(payload); else if (payload?.id) setJobs((cur) => [payload, ...cur.filter((job) => job.id !== payload.id)]); };
    socket.on("delivery-network.rider-location.updated", onLocation); socket.on("delivery-network.riders.updated", onRider); socket.on("delivery-network.jobs.updated", onJobs);
    return () => { socket.off("delivery-network.rider-location.updated", onLocation); socket.off("delivery-network.riders.updated", onRider); socket.off("delivery-network.jobs.updated", onJobs); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => { try { const [nextRiders, nextJobs] = await Promise.all([apiFetch<Rider[]>("/delivery-network/riders"), apiFetch<DeliveryJob[]>("/delivery-network/jobs")]); if (cancelled) return; setRiders((cur) => nextRiders.map((incoming) => { const existing = cur.find((r) => r.id === incoming.id); const live = !!realtimeAtRef.current[incoming.id] && Date.now() - realtimeAtRef.current[incoming.id] < STALE_AFTER_MS; return existing && live ? { ...incoming, locations: existing.locations } : incoming; })); setJobs(nextJobs); } catch {} };
    const id = window.setInterval(refresh, 30_000); return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  useEffect(() => {
    const map = mapRef.current; const m = (window as GoogleMapsWindow).google?.maps; if (!map || !m) return; const active = new Set<string>(); const bounds = new m.LatLngBounds();
    for (const rider of ridersWithKnownLocation) { const l = rider.locations[0]; const position = { lat: l.latitude, lng: l.longitude }; active.add(rider.id); const vehicle = rider.vehicles[0]; const fresh = isFresh(l); const title = `${rider.user.name} • ${rider.status}${vehicle?.plateNumber ? ` • ${vehicle.plateNumber}` : ""}${l.accuracy != null ? ` • ±${Math.round(l.accuracy)}m` : ""}${fresh ? "" : " • last known"}`; let marker = markersRef.current[rider.id]; if (marker) { marker.setPosition(position); marker.setTitle(title); } else { marker = new m.Marker({ map, position, title, icon: riderCircleIcon(m), zIndex: rider.id === selectedRiderId ? 3 : 1 }); markersRef.current[rider.id] = marker; listenersRef.current[rider.id] = marker.addListener("click", () => { setSelectedRiderId(rider.id); map.setCenter(position); }); } marker.setZIndex(rider.id === selectedRiderId ? 3 : 1); bounds.extend(position); }
    Object.entries(markersRef.current).forEach(([id, marker]) => { if (!active.has(id)) { marker.setMap(null); listenersRef.current[id]?.remove(); delete markersRef.current[id]; delete listenersRef.current[id]; } });
    if (!hasFitBoundsRef.current && ridersWithLocation.length > 1) { map.fitBounds(bounds, 56); hasFitBoundsRef.current = true; } else if (!hasFitBoundsRef.current && ridersWithLocation.length === 1) { map.setCenter({ lat: ridersWithLocation[0].locations[0].latitude, lng: ridersWithLocation[0].locations[0].longitude }); hasFitBoundsRef.current = true; }
  }, [ridersWithKnownLocation, ridersWithLocation, selectedRiderId]);

  const routeForSelectedRider = useMemo(() => {
    if (!selectedRider) return null; const riderJob = jobs.find((job) => job.riderId === selectedRider.id && ACTIVE_ROUTE_STATUSES.has(job.status)); if (!riderJob) return null; const riderLocation = point(selectedRider.locations[0]); const pickup = point({ latitude: riderJob.pickupLatitude, longitude: riderJob.pickupLongitude }); const dropoff = point({ latitude: riderJob.dropoffLatitude, longitude: riderJob.dropoffLongitude }); if (!riderLocation) return null; const goingToDropoff = riderJob.status === "picked_up" || riderJob.status === "delivering"; const destination = goingToDropoff ? dropoff : pickup ?? dropoff; if (!destination) return null; return { job: riderJob, riderLocation, pickup, dropoff, destination, phase: goingToDropoff ? "Drop-off" : "Pickup" };
  }, [selectedRider, jobs]);

  useEffect(() => {
    const map = mapRef.current; const m = (window as GoogleMapsWindow).google?.maps; if (!map || !m || !directionsRef.current) return; endpointMarkersRef.current.forEach((marker) => marker.setMap(null)); endpointMarkersRef.current = [];
    if (!routeForSelectedRider) { directionsRef.current.setDirections({ routes: [] }); setRouteError(null); return; }
    const { riderLocation, pickup, dropoff, destination } = routeForSelectedRider;
    if (pickup) endpointMarkersRef.current.push(new m.Marker({ map, position: pickup, title: "Pickup", icon: endpointIcon(m, "Pickup"), zIndex: 2 }));
    if (dropoff) endpointMarkersRef.current.push(new m.Marker({ map, position: dropoff, title: "Drop-off", icon: endpointIcon(m, "Drop-off"), zIndex: 2 }));
    let cancelled = false;
    new m.DirectionsService().route({ origin: riderLocation, destination, travelMode: m.TravelMode.DRIVING }, (result: any, status: string) => { if (cancelled) return; if (status === "OK" && result) { directionsRef.current.setDirections(result); map.fitBounds(result.routes[0].bounds, 56); setRouteError(null); } else { directionsRef.current.setDirections({ routes: [] }); setRouteError("Road route is unavailable for this rider."); } });
    return () => { cancelled = true; };
  }, [routeForSelectedRider?.job.id, routeForSelectedRider?.job.status, routeForSelectedRider?.riderLocation.lat, routeForSelectedRider?.riderLocation.lng, routeForSelectedRider?.pickup?.lat, routeForSelectedRider?.pickup?.lng, routeForSelectedRider?.dropoff?.lat, routeForSelectedRider?.dropoff?.lng, routeForSelectedRider?.destination.lat, routeForSelectedRider?.destination.lng]);

  useEffect(() => { const id = window.setInterval(() => setRiders((r) => [...r]), 5_000); return () => window.clearInterval(id); }, []);

  const recenter = () => { const map = mapRef.current; const points = routeForSelectedRider ? [routeForSelectedRider.riderLocation, routeForSelectedRider.pickup, routeForSelectedRider.dropoff] : ridersWithLocation.map((r) => point(r.locations[0])); if (!map || !mapsReady || !points.some(Boolean)) return; const m = (window as GoogleMapsWindow).google!.maps; const bounds = new m.LatLngBounds(); points.filter(Boolean).forEach((p: any) => bounds.extend(p)); map.fitBounds(bounds, 56); };

  return <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold">Live Rider Map</h2><span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-1 text-xs font-semibold text-success"><Radio size={12}/> Live</span></div><p className="mt-1 text-sm text-foreground/55">Live rider GPS, using the same map, route, and marker style as the rider web app. Click a rider to follow their current pickup/drop-off route.</p></div><div className="flex items-center gap-2 text-sm text-foreground/55"><LocateFixed size={16}/><span>{ridersWithLocation.length} active rider{ridersWithLocation.length === 1 ? "" : "s"}</span>{lastUpdate ? <span>• {new Date(lastUpdate).toLocaleTimeString()}</span> : null}</div></div><div className="px-5 pb-5"><div className="relative mt-5 overflow-hidden rounded-[22px] bg-[#E8EDF2]"><div ref={mapElementRef} className="h-[520px] w-full bg-[#E8EDF2]">{!mapsReady ? <div className="flex h-full items-center justify-center text-sm text-foreground/45">Loading Google Maps…</div> : null}</div><button type="button" onClick={recenter} aria-label="Recenter map" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md hover:bg-white/95"><LocateFixed size={18}/></button>{selectedRider ? <div className="absolute right-4 top-16 w-[320px] max-w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-black/10 bg-white/95 text-foreground shadow-2xl backdrop-blur-md"><div className="flex items-start justify-between border-b border-black/10 px-4 py-3"><div><div className="text-base font-semibold">{selectedRider.user.name}</div><div className="mt-0.5 text-xs text-foreground/50">Rider ID: {selectedRider.id.slice(-8)}</div></div><button type="button" onClick={() => setSelectedRiderId(null)} className="rounded-lg p-1.5 text-foreground/55 hover:bg-black/5 hover:text-foreground"><X size={17}/></button></div><div className="space-y-3 px-4 py-4"><div className="flex items-center justify-between"><span className="text-xs text-foreground/50">Status</span><span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-700">{selectedRider.status}</span></div><div className="flex items-center gap-2 text-sm"><CarFront size={15} className="text-foreground/50"/><span>{selectedRider.vehicles[0]?.type ?? "Vehicle"}{selectedRider.vehicles[0]?.model ? ` • ${selectedRider.vehicles[0].model}` : ""}{selectedRider.vehicles[0]?.plateNumber ? ` • ${selectedRider.vehicles[0].plateNumber}` : ""}</span></div>{selectedRider.phoneNumber ? <div className="text-sm text-foreground/75">{selectedRider.phoneNumber}</div> : null}{routeForSelectedRider ? <div className="flex items-center gap-2 rounded-xl bg-foreground/5 px-3 py-2 text-sm"><Navigation size={15} className="text-foreground/55"/><span>Following {routeForSelectedRider.phase}: {routeForSelectedRider.job.order?.customer.name ?? routeForSelectedRider.job.dropoffAddress}</span></div> : null}{routeError ? <div className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700">{routeError}</div> : null}<div className="grid grid-cols-2 gap-2 rounded-xl bg-foreground/5 p-3"><div><div className="text-[11px] text-foreground/45">Latitude</div><div className="mt-1 font-mono text-xs">{selectedRider.locations[0]?.latitude.toFixed(6) ?? "—"}</div></div><div><div className="text-[11px] text-foreground/45">Longitude</div><div className="mt-1 font-mono text-xs">{selectedRider.locations[0]?.longitude.toFixed(6) ?? "—"}</div></div></div><div className="grid grid-cols-2 gap-2 text-xs text-foreground/65"><div className="flex items-center gap-1"><Gauge size={13}/> Accuracy: {selectedRider.locations[0]?.accuracy != null ? `±${Math.round(selectedRider.locations[0].accuracy)}m` : "—"}</div><div className="flex items-center justify-end gap-1"><Clock3 size={13}/> {selectedRider.locations[0]?.createdAt ? formatAge(selectedRider.locations[0].createdAt) : "—"}</div></div></div></div> : null}</div></div>{ridersWithLocation.length === 0 ? <div className="border-t border-line px-5 py-3 text-sm text-foreground/50">No fresh GPS position is currently active. Last-known rider markers remain visible when a valid coordinate is available.</div> : null}</Card>;
}
