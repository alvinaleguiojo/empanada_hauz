"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Radio, X, Navigation, Gauge, Clock3, CarFront } from "lucide-react";
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
type MarkerIcon = { url: string; scaledSize?: unknown; anchor?: unknown };
type GoogleMapsWindow = Window & { google?: { maps?: { Map: new (element: HTMLElement, options: { center: { lat: number; lng: number }; zoom: number; mapTypeControl?: boolean; streetViewControl?: boolean; fullscreenControl?: boolean; styles?: unknown[] }) => GoogleMap; Marker: new (options: { map: GoogleMap; position: { lat: number; lng: number }; title?: string; label?: string; icon?: MarkerIcon }) => GoogleMarker; LatLngBounds: new () => GoogleBounds; Size: new (width: number, height: number) => unknown; Point: new (x: number, y: number) => unknown } } };
type GoogleMap = { fitBounds: (bounds: GoogleBounds, padding?: number) => void; setCenter: (center: { lat: number; lng: number }) => void; setZoom?: (zoom: number) => void };
type GoogleMarker = { setPosition: (position: { lat: number; lng: number }) => void; setTitle: (title: string) => void; setLabel: (label: string) => void; setMap: (map: GoogleMap | null) => void; setIcon?: (icon: MarkerIcon) => void; addListener: (event: string, handler: () => void) => { remove: () => void } };
type GoogleBounds = { extend: (position: { lat: number; lng: number }) => void };

const DEFAULT_CENTER = { lat: 10.3157, lng: 123.8854 };
const STALE_AFTER_MS = 45_000;
const MAX_ACCEPTABLE_ACCURACY_METERS = 100;

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#151a21" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9ca6b5" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#151a21" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#39424e" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#151a21" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1b222b" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#8f9baa" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#303844" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#242b34" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#aab3bf" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3b4653" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#242b34" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0c2534" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#6f8798" }] },
];

function isFreshLocation(location?: Rider["locations"][number]) {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return false;
  if (location.accuracy != null && location.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) return false;
  const age = Date.now() - new Date(location.createdAt).getTime();
  return Number.isFinite(age) && age >= 0 && age <= STALE_AFTER_MS;
}

function riderIcon(maps: NonNullable<GoogleMapsWindow["google"]>["maps"]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="62" viewBox="0 0 52 62"><path d="M26 2C13.3 2 3 12.3 3 25c0 16.8 23 34 23 34s23-17.2 23-34C49 12.3 38.7 2 26 2Z" fill="#ef6637" stroke="#fff" stroke-width="3"/><circle cx="26" cy="24" r="15" fill="#171c23"/><circle cx="26" cy="19" r="5" fill="#fff"/><path d="M16 34c2.8-7.2 17.2-7.2 20 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M18 15l-4-5m20 5 4-5" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new maps!.Size(52, 62), anchor: new maps!.Point(26, 59) };
}

function formatAge(createdAt: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 1000));
  return seconds < 5 ? "just now" : `${seconds}s ago`;
}

export function RiderLiveMap({ initialRiders }: { initialRiders: Rider[] }) {
  const [riders, setRiders] = useState(initialRiders);
  const [mapsReady, setMapsReady] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<Record<string, GoogleMarker>>({});
  const markerListenersRef = useRef<Record<string, { remove: () => void }>>({});
  const realtimeAtRef = useRef<Record<string, number>>({});
  const hasFitBoundsRef = useRef(false);

  const ridersWithLocation = useMemo(() => riders.filter((rider) => isFreshLocation(rider.locations[0])), [riders]);
  const selectedRider = useMemo(() => ridersWithLocation.find((rider) => rider.id === selectedRiderId) ?? null, [ridersWithLocation, selectedRiderId]);

  useEffect(() => {
    let cancelled = false; let timer: number | null = null; let attempts = 0;
    const tryReady = () => { if (cancelled) return; const maps = (window as GoogleMapsWindow).google?.maps; if (maps?.Map && maps.Marker && maps.LatLngBounds && maps.Size && maps.Point) return setMapsReady(true); if (attempts++ < 120) timer = window.setTimeout(tryReady, 250); };
    tryReady(); return () => { cancelled = true; if (timer !== null) window.clearTimeout(timer); };
  }, []);

  useEffect(() => { if (!mapsReady || !mapElementRef.current || mapRef.current) return; const maps = (window as GoogleMapsWindow).google!.maps!; mapRef.current = new maps.Map(mapElementRef.current, { center: DEFAULT_CENTER, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, styles: DARK_MAP_STYLES }); }, [mapsReady]);

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
    for (const rider of ridersWithLocation) {
      const location = rider.locations[0]; const position = { lat: location.latitude, lng: location.longitude }; activeIds.add(rider.id);
      const vehicle = rider.vehicles[0]; const title = `${rider.user.name} • ${rider.status}${vehicle?.plateNumber ? ` • ${vehicle.plateNumber}` : ""}${location.accuracy != null ? ` • ±${Math.round(location.accuracy)}m` : ""}`;
      const marker = markersRef.current[rider.id];
      if (marker) { marker.setPosition(position); marker.setTitle(title); marker.setIcon?.(riderIcon(maps)); }
      else {
        const created = new maps.Marker({ map, position, title, icon: riderIcon(maps) });
        markerListenersRef.current[rider.id]?.remove(); markerListenersRef.current[rider.id] = created.addListener("click", () => { setSelectedRiderId(rider.id); map.setCenter(position); }); markersRef.current[rider.id] = created;
      }
      bounds.extend(position);
    }
    Object.entries(markersRef.current).forEach(([id, marker]) => { if (!activeIds.has(id)) { marker.setMap(null); markerListenersRef.current[id]?.remove(); delete markerListenersRef.current[id]; delete markersRef.current[id]; if (selectedRiderId === id) setSelectedRiderId(null); } });
    if (ridersWithLocation.length > 1 && !hasFitBoundsRef.current) { map.fitBounds(bounds, 60); hasFitBoundsRef.current = true; } else if (ridersWithLocation.length === 1 && !hasFitBoundsRef.current) { const l = ridersWithLocation[0].locations[0]; map.setCenter({ lat: l.latitude, lng: l.longitude }); hasFitBoundsRef.current = true; }
  }, [ridersWithLocation, selectedRiderId]);

  useEffect(() => { const timer = window.setInterval(() => setRiders((current) => [...current]), 5_000); return () => window.clearInterval(timer); }, []);

  return <Card className="overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold">Live Rider Map</h2><span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-1 text-xs font-semibold text-success"><Radio size={12} /> Live</span></div><p className="mt-1 text-sm text-foreground/55">Only fresh, GPS-validated rider positions are shown.</p></div><div className="flex items-center gap-2 text-sm text-foreground/55"><LocateFixed size={16} /><span>{ridersWithLocation.length} rider{ridersWithLocation.length === 1 ? "" : "s"} on map</span>{lastUpdate ? <span>• {new Date(lastUpdate).toLocaleTimeString()}</span> : null}</div></div>
    <div className="relative"><div ref={mapElementRef} className="h-[520px] w-full bg-[#151a21]">{!mapsReady ? <div className="flex h-full items-center justify-center text-sm text-white/50">Loading Google Maps…</div> : null}</div>
      {selectedRider ? <div className="absolute right-4 top-4 w-[320px] max-w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#11161d]/95 text-white shadow-2xl backdrop-blur-md">
        <div className="flex items-start justify-between border-b border-white/10 px-4 py-3"><div><div className="text-base font-semibold">{selectedRider.user.name}</div><div className="mt-0.5 text-xs text-white/55">Rider ID: {selectedRider.id.slice(-8)}</div></div><button type="button" onClick={() => setSelectedRiderId(null)} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close rider details"><X size={17} /></button></div>
        <div className="space-y-3 px-4 py-4">
          <div className="flex items-center justify-between"><span className="text-xs text-white/50">Status</span><span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-300">{selectedRider.status}</span></div>
          <div className="flex items-center gap-2 text-sm"><CarFront size={15} className="text-white/50" /><span>{selectedRider.vehicles[0]?.type ?? "Vehicle"}{selectedRider.vehicles[0]?.model ? ` • ${selectedRider.vehicles[0].model}` : ""}{selectedRider.vehicles[0]?.plateNumber ? ` • ${selectedRider.vehicles[0].plateNumber}` : ""}</span></div>
          {selectedRider.phoneNumber ? <div className="text-sm text-white/75">{selectedRider.phoneNumber}</div> : null}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-3"><div><div className="flex items-center gap-1 text-[11px] text-white/45"><Navigation size={12} /> Latitude</div><div className="mt-1 font-mono text-xs">{selectedRider.locations[0].latitude.toFixed(6)}</div></div><div><div className="text-[11px] text-white/45">Longitude</div><div className="mt-1 font-mono text-xs">{selectedRider.locations[0].longitude.toFixed(6)}</div></div></div>
          <div className="grid grid-cols-2 gap-2 text-xs text-white/65"><div className="flex items-center gap-1"><Gauge size={13} /> Accuracy: {selectedRider.locations[0].accuracy != null ? `±${Math.round(selectedRider.locations[0].accuracy)}m` : "—"}</div><div className="flex items-center justify-end gap-1"><Clock3 size={13} /> {formatAge(selectedRider.locations[0].createdAt)}</div></div>
          {selectedRider.locations[0].speed != null ? <div className="text-xs text-white/55">Speed: {(selectedRider.locations[0].speed * 3.6).toFixed(1)} km/h</div> : null}
        </div>
      </div> : null}
    </div>
    {ridersWithLocation.length === 0 ? <div className="border-t border-line px-5 py-3 text-sm text-foreground/50">No fresh GPS position is available. The rider marker is intentionally hidden until a validated location arrives.</div> : null}
  </Card>;
}
