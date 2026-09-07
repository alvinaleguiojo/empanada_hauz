"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Radio, RefreshCw } from "lucide-react";
import { API_URL } from "@/lib/config";
import { cn } from "@/lib/utils";

type Coordinate = { latitude: number; longitude: number };
type TrackingJob = {
  id: string;
  status: string;
  pickupAddress: string;
  pickupLatitude?: number | null;
  pickupLongitude?: number | null;
  dropoffAddress: string;
  dropoffLatitude?: number | null;
  dropoffLongitude?: number | null;
  estimatedDurationMinutes?: number | null;
  estimatedArrivalAt?: string | null;
  updatedAt?: string | null;
  rider?: {
    name?: string | null;
    phoneNumber?: string | null;
    plateNumber?: string | null;
    vehicleType?: string | null;
    location?: {
      latitude: number;
      longitude: number;
      heading?: number | null;
      speed?: number | null;
      createdAt: string;
    } | null;
  } | null;
};
type RiderLocation = NonNullable<TrackingJob["rider"]>["location"];

type Props = { orderId: string; initialJob?: TrackingJob | null };
type GoogleMapsWindow = Window & { google?: { maps?: any } };

const RIDER_ORANGE = "#F4581D";
const RIDER_RED = "#D5473A";
const MAP_BACKGROUND = "#E8EDF2";
const ACTIVE_STATUSES = new Set(["requested", "searching_rider", "assigned", "accepted", "pickup_started", "picked_up", "delivering"]);

let mapsLoader: Promise<any> | null = null;

async function loadGoogleMaps() {
  if ((window as GoogleMapsWindow).google?.maps) return (window as GoogleMapsWindow).google!.maps;
  if (mapsLoader) return mapsLoader;
  mapsLoader = fetch("/api/google-maps-key", { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error(`Google Maps key endpoint returned ${response.status}`);
    const data = await response.json() as { apiKey?: string };
    const key = data.apiKey?.trim();
    if (!key) throw new Error("Google Maps API key is not configured.");
    const existing = document.getElementById("empanada-google-maps") as HTMLScriptElement | null;
    if (existing) {
      if ((window as GoogleMapsWindow).google?.maps) return (window as GoogleMapsWindow).google!.maps;
      await new Promise<void>((resolve, reject) => { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("Unable to load Google Maps.")), { once: true }); });
      return (window as GoogleMapsWindow).google!.maps;
    }
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script"); script.id = "empanada-google-maps"; script.async = true; script.defer = true; script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`; script.onload = () => resolve(); script.onerror = () => reject(new Error("Unable to load Google Maps.")); document.head.appendChild(script);
    });
    return (window as GoogleMapsWindow).google!.maps;
  });
  try { return await mapsLoader; } catch (error) { mapsLoader = null; throw error; }
}

function point(value?: { latitude?: number | null; longitude?: number | null } | null) {
  return value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude)) ? { lat: Number(value.latitude), lng: Number(value.longitude) } : null;
}
function riderIcon(maps: any) { return { path: maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#FFFFFF", fillOpacity: 1, strokeColor: RIDER_ORANGE, strokeWeight: 3 }; }
function endpointIcon(maps: any, kind: "Pickup" | "Drop-off") { return { path: maps.SymbolPath.CIRCLE, scale: 13, fillColor: kind === "Pickup" ? RIDER_ORANGE : RIDER_RED, fillOpacity: 1, strokeColor: "#FFFFFF", strokeWeight: 3 }; }
function isFresh(location: RiderLocation) { if (!location) return false; const age = Date.now() - new Date(location.createdAt).getTime(); return Number.isFinite(age) && age >= 0 && age <= 45_000; }

export function TrackingRiderMap({ orderId, initialJob = null }: Props) {
  const [job, setJob] = useState<TrackingJob | null>(initialJob);
  const [mapsReady, setMapsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(initialJob?.rider?.location?.createdAt ? new Date(initialJob.rider.location.createdAt) : null);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const directionsRef = useRef<any>(null);
  const riderMarkerRef = useRef<any>(null);
  const endpointMarkersRef = useRef<any[]>([]);

  const route = useMemo(() => {
    if (!job || !ACTIVE_STATUSES.has(job.status)) return null;
    const riderLocation = point(job.rider?.location);
    const pickup = point({ latitude: job.pickupLatitude, longitude: job.pickupLongitude });
    const dropoff = point({ latitude: job.dropoffLatitude, longitude: job.dropoffLongitude });
    const destination = job.status === "picked_up" || job.status === "delivering" ? dropoff : pickup ?? dropoff;
    return { riderLocation, pickup, dropoff, destination };
  }, [job]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => { if (!cancelled) setMapsReady(true); }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Map unavailable"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapsReady || !mapElementRef.current || mapRef.current) return;
    const maps = (window as GoogleMapsWindow).google!.maps;
    mapRef.current = new maps.Map(mapElementRef.current, { center: { lat: 10.3157, lng: 123.8854 }, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, backgroundColor: MAP_BACKGROUND });
    directionsRef.current = new maps.DirectionsRenderer({ map: mapRef.current, suppressMarkers: true, polylineOptions: { strokeColor: RIDER_ORANGE, strokeOpacity: 0.95, strokeWeight: 5 } });
  }, [mapsReady]);

  const refresh = async () => {
    try {
      const response = await fetch(`${API_URL}/orders/track/${encodeURIComponent(orderId)}`, { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json() as { deliveryJob?: TrackingJob | null };
      setJob(next.deliveryJob ?? null);
      setLastRefresh(next.deliveryJob?.rider?.location?.createdAt ? new Date(next.deliveryJob.rider.location.createdAt) : new Date());
      setError(null);
    } catch { setError("Live tracking is temporarily unavailable."); }
  };

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [orderId]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = (window as GoogleMapsWindow).google?.maps;
    if (!map || !maps) return;
    if (riderMarkerRef.current) riderMarkerRef.current.setMap(null);
    riderMarkerRef.current = null;
    endpointMarkersRef.current.forEach((marker) => marker.setMap(null));
    endpointMarkersRef.current = [];
    if (!route) { directionsRef.current?.setDirections({ routes: [] }); return; }

    if (route.riderLocation) riderMarkerRef.current = new maps.Marker({ map, position: route.riderLocation, title: job?.rider?.name ? `${job.rider.name} — Rider` : "Rider", icon: riderIcon(maps), zIndex: 3 });
    if (route.pickup) endpointMarkersRef.current.push(new maps.Marker({ map, position: route.pickup, title: "Pickup", icon: endpointIcon(maps, "Pickup"), zIndex: 2 }));
    if (route.dropoff) endpointMarkersRef.current.push(new maps.Marker({ map, position: route.dropoff, title: "Drop-off", icon: endpointIcon(maps, "Drop-off"), zIndex: 2 }));

    if (!route.riderLocation || !route.destination) {
      directionsRef.current?.setDirections({ routes: [] });
      const points = [route.riderLocation, route.pickup, route.dropoff].filter(Boolean);
      if (points.length) { const bounds = new maps.LatLngBounds(); points.forEach((p: any) => bounds.extend(p)); map.fitBounds(bounds, 56); }
      return;
    }

    new maps.DirectionsService().route({ origin: route.riderLocation, destination: route.destination, travelMode: maps.TravelMode.DRIVING }, (result: any, status: string) => {
      if (status === "OK" && result) { directionsRef.current?.setDirections(result); map.fitBounds(result.routes[0].bounds, 56); setError(null); }
      else { directionsRef.current?.setDirections({ routes: [] }); setError("Road route is unavailable for this delivery."); }
    });
  }, [mapsReady, route?.riderLocation?.lat, route?.riderLocation?.lng, route?.pickup?.lat, route?.pickup?.lng, route?.dropoff?.lat, route?.dropoff?.lng, route?.destination?.lat, route?.destination?.lng, route ? job?.status : null, job?.rider?.name]);

  const hasFreshLocation = isFresh(job?.rider?.location ?? null);

  return (
    <section className="rounded-[22px] border border-line/80 bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Live Delivery Tracking</p><h2 className="mt-2 text-xl font-semibold">Track your rider</h2><p className="mt-1 text-sm text-foreground/52">The rider location refreshes automatically while your delivery is active.</p></div>
        <div className="flex items-center gap-2"><span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", hasFreshLocation ? "bg-emerald-500/12 text-emerald-700" : "bg-black/8 text-foreground/50")}><Radio size={12} /> {hasFreshLocation ? "Live" : "Waiting for GPS"}</span><button type="button" onClick={() => void refresh()} aria-label="Refresh tracking" className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-white hover:bg-black/5"><RefreshCw size={15} /></button></div>
      </div>
      <div className="relative mt-4 overflow-hidden rounded-[22px] bg-[#E8EDF2]"><div ref={mapElementRef} className="h-[460px] w-full bg-[#E8EDF2]">{!mapsReady ? <div className="flex h-full items-center justify-center text-sm text-foreground/45">Loading Google Maps…</div> : null}</div><button type="button" onClick={() => { const map = mapRef.current; const points = [route?.riderLocation, route?.pickup, route?.dropoff].filter(Boolean); const maps = (window as GoogleMapsWindow).google?.maps; if (!map || !maps || !points.length) return; const bounds = new maps.LatLngBounds(); points.forEach((p: any) => bounds.extend(p)); map.fitBounds(bounds, 56); }} aria-label="Recenter map" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md hover:bg-white/95"><LocateFixed size={18} /></button>{error ? <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-red-200 bg-white/95 px-3 py-2 text-xs font-semibold text-red-700 shadow-sm">{error}</div> : null}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-line/70 bg-black/[0.03] px-3 py-3"><p className="text-[11px] uppercase tracking-[0.14em] text-foreground/35">Delivery</p><p className="mt-1 text-sm font-semibold capitalize">{job?.status?.replaceAll("_", " ") ?? "Not assigned yet"}</p></div><div className="rounded-xl border border-line/70 bg-black/[0.03] px-3 py-3"><p className="text-[11px] uppercase tracking-[0.14em] text-foreground/35">Rider</p><p className="mt-1 text-sm font-semibold">{job?.rider?.name ?? "Waiting for rider"}</p>{job?.rider?.plateNumber ? <p className="mt-1 text-xs text-foreground/50">{job.rider.vehicleType ?? "Vehicle"} · {job.rider.plateNumber}</p> : null}</div><div className="rounded-xl border border-line/70 bg-black/[0.03] px-3 py-3"><p className="text-[11px] uppercase tracking-[0.14em] text-foreground/35">Last GPS</p><p className="mt-1 text-sm font-semibold">{lastRefresh ? lastRefresh.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—"}</p></div></div>
    </section>
  );
}
