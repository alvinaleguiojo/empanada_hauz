"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Navigation, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/card";

type CustomerOriginLocation = {
  location: string | null;
  _count?: { _all?: number };
};

type GeoPoint = { lat: number; lng: number; area: string; formattedAddress: string };
type GoogleMapsWindow = { google?: { maps?: any } };

const DEFAULT_CENTER = { lat: 10.3157, lng: 123.8854 };
const GEO_CACHE = new Map<string, GeoPoint | null>();

function normalize(value: string) { return value.trim().replace(/\s+/g, " ").toLowerCase(); }
function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll(String.fromCharCode(34), "&quot;");
}

function getArea(results: any[], fallback: string) {
  const preferred = ["locality", "administrative_area_level_2", "administrative_area_level_3", "sublocality_level_1", "sublocality"];
  for (const type of preferred) {
    for (const result of results || []) {
      const component = (result.address_components || []).find((item: any) => (item.types || []).includes(type));
      if (component?.long_name) return component.long_name;
    }
  }
  return results?.[0]?.formatted_address?.split(",")?.[0]?.trim() || fallback;
}

async function geocode(geocoder: any, address: string): Promise<GeoPoint | null> {
  const key = normalize(address);
  if (GEO_CACHE.has(key)) return GEO_CACHE.get(key) ?? null;
  const result = await new Promise<GeoPoint | null>((resolve) => {
    geocoder.geocode({ address, region: "PH" }, (results: any[], status: string) => {
      if (status !== "OK" || !results?.length) return resolve(null);
      const location = results[0]?.geometry?.location;
      const lat = location?.lat?.();
      const lng = location?.lng?.();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return resolve(null);
      resolve({ lat, lng, area: getArea(results, address), formattedAddress: results[0]?.formatted_address || address });
    });
  });
  GEO_CACHE.set(key, result);
  return result;
}

export function CustomerOriginMap({ locations, rangeLabel }: { locations: CustomerOriginLocation[]; rangeLabel: string }) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapped, setMapped] = useState<Array<CustomerOriginLocation & { geo: GeoPoint; count: number }>>([]);

  const sourceLocations = useMemo(() => locations
    .filter((item) => item.location?.trim())
    .map((item) => ({ ...item, location: item.location!.trim(), count: Math.max(0, Number(item._count?._all ?? 0)) }))
    .sort((a, b) => b.count - a.count || a.location.localeCompare(b.location))
    .slice(0, 5), [locations]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let attempts = 0;
    const check = () => {
      const maps = (window as unknown as GoogleMapsWindow).google?.maps;
      if (maps?.Map && maps.Marker && maps.LatLngBounds && maps.InfoWindow && maps.Geocoder) return setMapsReady(true);
      if (!cancelled && attempts < 120) { attempts += 1; timer = window.setTimeout(check, 250); }
      else if (!cancelled) setMapError("Google Maps is unavailable right now.");
    };
    check();
    return () => { cancelled = true; if (timer !== null) window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!mapsReady || !mapElementRef.current || mapRef.current) return;
    const maps = (window as unknown as GoogleMapsWindow).google!.maps!;
    mapRef.current = new maps.Map(mapElementRef.current, { center: DEFAULT_CENTER, zoom: 11, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, clickableIcons: false, gestureHandling: "greedy" });
    infoWindowRef.current = new maps.InfoWindow();
  }, [mapsReady]);

  useEffect(() => {
    if (!mapsReady) return;
    if (sourceLocations.length === 0) { setMapped([]); setMapping(false); return; }
    let cancelled = false;
    const run = async () => {
      setMapping(true);
      setMapError(null);
      try {
        const geocoder = new ((window as unknown as GoogleMapsWindow).google!.maps!.Geocoder)();
        const next: Array<CustomerOriginLocation & { geo: GeoPoint; count: number }> = [];
        for (const item of sourceLocations) {
          const geo = await geocode(geocoder, item.location!);
          if (cancelled) return;
          if (geo) next.push({ ...item, geo, count: item.count });
        }
        if (!cancelled) {
          setMapped(next);
          if (!next.length) setMapError("No customer addresses could be mapped for this range.");
        }
      } catch {
        if (!cancelled) { setMapped([]); setMapError("Unable to map customer locations right now."); }
      } finally {
        if (!cancelled) setMapping(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [mapsReady, sourceLocations]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = (window as unknown as GoogleMapsWindow).google?.maps;
    if (!map || !maps) return;
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
    if (!mapped.length) { map.setCenter(DEFAULT_CENTER); map.setZoom(11); return; }
    const bounds = new maps.LatLngBounds();
    mapped.forEach((item, index) => {
      const position = { lat: item.geo.lat, lng: item.geo.lng };
      const marker = new maps.Marker({
        map, position, zIndex: 100 - index,
        title: item.geo.area + " • " + item.count + " order" + (item.count === 1 ? "" : "s"),
        icon: { path: maps.SymbolPath.CIRCLE, scale: Math.min(18, 9 + Math.min(item.count, 20) * 0.45), fillColor: "#F4581D", fillOpacity: 0.96, strokeColor: "#FFFFFF", strokeWeight: 3 },
        label: { text: String(item.count), color: "#FFFFFF", fontSize: "11px", fontWeight: "800" }
      });
      marker.addListener("click", () => {
        infoWindowRef.current?.setContent("<div style=\"min-width:190px;padding:4px 2px;font-family:Inter,system-ui,sans-serif\"><div style=\"font-size:13px;font-weight:800;color:#172139\">" + escapeHtml(item.geo.area) + "</div><div style=\"margin-top:4px;font-size:12px;color:#64748b\">" + item.count + " order" + (item.count === 1 ? "" : "s") + "</div><div style=\"margin-top:8px;font-size:11px;line-height:1.45;color:#64748b\">" + escapeHtml(item.geo.formattedAddress) + "</div></div>");
        infoWindowRef.current?.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
      bounds.extend(position);
    });
    if (mapped.length === 1) { map.setCenter({ lat: mapped[0].geo.lat, lng: mapped[0].geo.lng }); map.setZoom(14); }
    else map.fitBounds(bounds, 48);
  }, [mapped]);

  const topOrders = sourceLocations.reduce((sum, item) => sum + item.count, 0);
  const mappedOrders = mapped.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="h-[3px] w-full bg-accent" />
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold tracking-tight">Customer Origin Map</h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-accent"><Navigation size={11} /> Google Maps</span>
            </div>
            <p className="mt-1 text-xs text-foreground/45">Top customer locations from {rangeLabel.toLowerCase()} scheduled or created orders.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-foreground/50"><span className="inline-flex items-center gap-1.5"><UsersRound size={13} /> {topOrders} top-location orders</span>{mapping ? <Loader2 size={14} className="animate-spin text-accent" /> : null}</div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_300px]">
          <div className="relative min-w-0 overflow-hidden rounded-2xl border border-line/70 bg-[#E8EDF2] shadow-inner shadow-black/5">
            <div ref={mapElementRef} className="h-[420px] w-full sm:h-[460px]" />
            {!mapsReady ? <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[#E8EDF2] text-sm text-foreground/45"><Loader2 size={16} className="animate-spin" /> Loading Google Maps…</div> : null}
            {mapsReady && sourceLocations.length === 0 ? <div className="absolute inset-0 flex items-center justify-center bg-[#E8EDF2]/85 px-6 text-center backdrop-blur-[2px]"><div><MapPin className="mx-auto text-foreground/35" size={28} /><p className="mt-3 text-sm font-semibold text-foreground/65">No customer locations in this range yet.</p><p className="mt-1 text-xs text-foreground/45">Customer addresses will appear here as orders are recorded.</p></div></div> : null}
            {mapError ? <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-black/10 bg-white/95 px-3 py-2 text-xs font-medium text-slate-700 shadow-lg">{mapError}</div> : null}
            <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-black/10 bg-white/95 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-700 shadow-sm">Larger circles = more orders</div>
          </div>

          <div className="rounded-2xl border border-line/70 bg-black/[0.04] p-3">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/40">Top areas</p><p className="mt-1 text-sm font-semibold text-foreground/80">Where orders are coming from</p></div><MapPin size={16} className="text-accent" /></div>
            <div className="mt-3 space-y-2">
              {sourceLocations.length === 0 ? <div className="rounded-xl border border-dashed border-line/70 px-3 py-8 text-center text-xs text-foreground/40">No location data yet.</div> : sourceLocations.map((item, index) => {
                const mappedItem = mapped.find((entry) => normalize(entry.location || "") === normalize(item.location || ""));
                const displayArea = mappedItem?.geo.area || item.location || "Unknown";
                return <div key={String(item.location) + "-" + index} className="rounded-xl border border-line/70 bg-panel px-3 py-3"><div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-[11px] font-extrabold text-white">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-foreground/85">{displayArea}</p><p className="mt-0.5 truncate text-[11px] text-foreground/40">{item.location}</p></div><span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-[11px] font-bold tabular-nums text-accent">{item.count}</span></div></div>;
              })}
            </div>
            {mappedOrders > 0 ? <div className="mt-3 rounded-xl border border-success/15 bg-success/8 px-3 py-2.5 text-xs text-foreground/55"><span className="font-semibold text-success">{mappedOrders}</span> of {topOrders} top-location orders are mapped on the map.</div> : null}
          </div>
        </div>
      </div>
    </Card>
  );
}