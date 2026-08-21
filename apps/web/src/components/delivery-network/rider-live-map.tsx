"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Radio } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { socket } from "@/lib/socket";
import { Card } from "@/components/ui/card";

type Rider = {
  id: string; phoneNumber?: string | null; status: string; serviceArea?: string | null;
  user: { name: string; email: string };
  vehicles: Array<{ type: string; plateNumber?: string | null; model?: string | null }>;
  locations: Array<{ latitude: number; longitude: number; heading?: number | null; speed?: number | null; accuracy?: number | null; createdAt: string }>;
};
type RiderLocationEvent = { riderId: string; latitude: number; longitude: number; heading?: number | null; speed?: number | null; accuracy?: number | null; createdAt: string };
type GoogleMapsWindow = Window & { google?: { maps?: { Map: new (element: HTMLElement, options: { center: { lat: number; lng: number }; zoom: number; mapTypeControl?: boolean; streetViewControl?: boolean; fullscreenControl?: boolean }) => GoogleMap; Marker: new (options: { map: GoogleMap; position: { lat: number; lng: number }; title?: string; label?: string }) => GoogleMarker; LatLngBounds: new () => GoogleBounds } } };
type GoogleMap = { fitBounds: (bounds: GoogleBounds, padding?: number) => void; setCenter: (center: { lat: number; lng: number }) => void };
type GoogleMarker = { setPosition: (position: { lat: number; lng: number }) => void; setTitle: (title: string) => void; setLabel: (label: string) => void; setMap: (map: GoogleMap | null) => void };
type GoogleBounds = { extend: (position: { lat: number; lng: number }) => void };

const DEFAULT_CENTER = { lat: 10.3157, lng: 123.8854 };
const STALE_AFTER_MS = 45_000;
const MAX_ACCEPTABLE_ACCURACY_METERS = 100;

function isFreshLocation(location?: Rider["locations"][number]) {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return false;
  if (location.accuracy != null && location.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) return false;
  const age = Date.now() - new Date(location.createdAt).getTime();
  return Number.isFinite(age) && age >= 0 && age <= STALE_AFTER_MS;
}

export function RiderLiveMap({ initialRiders }: { initialRiders: Rider[] }) {
  const [riders, setRiders] = useState(initialRiders);
  const [mapsReady, setMapsReady] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<Record<string, GoogleMarker>>({});
  const realtimeAtRef = useRef<Record<string, number>>({});
  const hasFitBoundsRef = useRef(false);

  const ridersWithLocation = useMemo(() => riders.filter((rider) => isFreshLocation(rider.locations[0])), [riders]);

  useEffect(() => {
    let cancelled = false; let timer: number | null = null; let attempts = 0;
    const tryReady = () => { if (cancelled) return; const maps = (window as GoogleMapsWindow).google?.maps; if (maps?.Map && maps.Marker && maps.LatLngBounds) return setMapsReady(true); if (attempts++ < 120) timer = window.setTimeout(tryReady, 250); };
    tryReady(); return () => { cancelled = true; if (timer !== null) window.clearTimeout(timer); };
  }, []);

  useEffect(() => { if (!mapsReady || !mapElementRef.current || mapRef.current) return; const maps = (window as GoogleMapsWindow).google!.maps!; mapRef.current = new maps.Map(mapElementRef.current, { center: DEFAULT_CENTER, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: true }); }, [mapsReady]);

  useEffect(() => {
    const handleLocation = (payload: RiderLocationEvent) => {
      if (!payload?.riderId || !Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude) || !payload.createdAt) return;
      const age = Date.now() - new Date(payload.createdAt).getTime();
      if (!Number.isFinite(age) || age < -10_000 || age > STALE_AFTER_MS || (payload.accuracy != null && payload.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS)) return;
      realtimeAtRef.current[payload.riderId] = Date.now();
      setRiders((current) => current.map((rider) => rider.id === payload.riderId ? { ...rider, locations: [{ latitude: payload.latitude, longitude: payload.longitude, heading: payload.heading, speed: payload.speed, accuracy: payload.accuracy, createdAt: payload.createdAt }] } : rider));
      setLastUpdate(payload.createdAt);
    };
    const handleRider = (payload: Rider) => {
      if (!payload?.id) return;
      setRiders((current) => { const index = current.findIndex((rider) => rider.id === payload.id); if (index < 0) return [...current, payload]; const next = [...current]; const hasRealtime = !!realtimeAtRef.current[payload.id] && Date.now() - realtimeAtRef.current[payload.id] < STALE_AFTER_MS; next[index] = { ...next[index], ...payload, locations: hasRealtime ? next[index].locations : (payload.locations?.length ? payload.locations : next[index].locations) }; return next; });
    };
    socket.on("delivery-network.rider-location.updated", handleLocation); socket.on("delivery-network.riders.updated", handleRider);
    return () => { socket.off("delivery-network.rider-location.updated", handleLocation); socket.off("delivery-network.riders.updated", handleRider); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => { try { const next = await apiFetch<Rider[]>("/delivery-network/riders"); if (cancelled) return; setRiders((current) => next.map((incoming) => { const existing = current.find((rider) => rider.id === incoming.id); const hasRealtime = !!realtimeAtRef.current[incoming.id] && Date.now() - realtimeAtRef.current[incoming.id] < STALE_AFTER_MS; return existing && hasRealtime ? { ...incoming, locations: existing.locations } : incoming; })); } catch { /* socket is primary */ } };
    const interval = window.setInterval(refresh, 30_000); return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const map = mapRef.current; const maps = (window as GoogleMapsWindow).google?.maps; if (!map || !maps) return;
    const activeIds = new Set<string>(); const bounds = new maps.LatLngBounds();
    for (const rider of ridersWithLocation) { const location = rider.locations[0]; const position = { lat: location.latitude, lng: location.longitude }; activeIds.add(rider.id); const vehicle = rider.vehicles[0]; const title = `${rider.user.name} • ${rider.status}${vehicle?.plateNumber ? ` • ${vehicle.plateNumber}` : ""}${location.accuracy != null ? ` • ±${Math.round(location.accuracy)}m` : ""}`; const marker = markersRef.current[rider.id]; if (marker) { marker.setPosition(position); marker.setTitle(title); marker.setLabel(rider.user.name.slice(0, 1).toUpperCase()); } else markersRef.current[rider.id] = new maps.Marker({ map, position, title, label: rider.user.name.slice(0, 1).toUpperCase() }); bounds.extend(position); }
    Object.entries(markersRef.current).forEach(([id, marker]) => { if (!activeIds.has(id)) { marker.setMap(null); delete markersRef.current[id]; } });
    if (ridersWithLocation.length > 1 && !hasFitBoundsRef.current) { map.fitBounds(bounds, 60); hasFitBoundsRef.current = true; } else if (ridersWithLocation.length === 1 && !hasFitBoundsRef.current) { const l = ridersWithLocation[0].locations[0]; map.setCenter({ lat: l.latitude, lng: l.longitude }); hasFitBoundsRef.current = true; }
  }, [ridersWithLocation]);

  useEffect(() => { const timer = window.setInterval(() => setRiders((current) => [...current]), 5_000); return () => window.clearInterval(timer); }, []);

  return <Card className="overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold">Live Rider Map</h2><span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-1 text-xs font-semibold text-success"><Radio size={12} /> Live</span></div><p className="mt-1 text-sm text-foreground/55">Only fresh, GPS-validated rider positions are shown.</p></div><div className="flex items-center gap-2 text-sm text-foreground/55"><LocateFixed size={16} /><span>{ridersWithLocation.length} rider{ridersWithLocation.length === 1 ? "" : "s"} on map</span>{lastUpdate ? <span>• {new Date(lastUpdate).toLocaleTimeString()}</span> : null}</div></div>
    <div ref={mapElementRef} className="h-[520px] w-full bg-black/10">{!mapsReady ? <div className="flex h-full items-center justify-center text-sm text-foreground/50">Loading Google Maps…</div> : null}</div>
    {ridersWithLocation.length === 0 ? <div className="border-t border-line px-5 py-3 text-sm text-foreground/50">No fresh GPS position is available. The rider marker is intentionally hidden until a validated location arrives.</div> : null}
  </Card>;
}
