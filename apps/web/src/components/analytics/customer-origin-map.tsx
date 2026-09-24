"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Navigation, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/card";

type CustomerOriginLocation = {
  location: string | null;
  _count?: { _all?: number };
};

type GeoPoint = { lat: number; lng: number; area: string; formattedAddress: string };
type MappedLocation = CustomerOriginLocation & { geo: GeoPoint; count: number };
type AreaGroup = { area: string; count: number; addressCount: number; center: { lat: number; lng: number }; addresses: string[] };
type GoogleMapsWindow = { google?: { maps?: any } };

const DEFAULT_CENTER = { lat: 10.3157, lng: 123.8854 };
const GEO_CACHE = new Map<string, GeoPoint | null>();
const GEO_CACHE_PREFIX = "empanada-origin-geocode:v2:";

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa7bb" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1220" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#263246" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#8c9ab0" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d4dbea" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1b2638" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#101827" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#718097" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2a3a53" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#172235" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#9aa7bb" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#07111f" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5d6f88" }] }
];

function normalize(value: string) { return value.trim().replace(/\s+/g, " ").toLowerCase(); }

function readCachedGeo(key: string) {
  if (GEO_CACHE.has(key)) return GEO_CACHE.get(key) ?? null;
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(GEO_CACHE_PREFIX + key);
    if (!stored) return undefined;
    const parsed = JSON.parse(stored) as GeoPoint | null;
    GEO_CACHE.set(key, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function writeCachedGeo(key: string, value: GeoPoint | null) {
  GEO_CACHE.set(key, value);
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(GEO_CACHE_PREFIX + key, JSON.stringify(value)); } catch {}
}

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
  const cached = readCachedGeo(key);
  if (cached !== undefined) return cached;
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
  writeCachedGeo(key, result);
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
  const [mapped, setMapped] = useState<MappedLocation[]>([]);

  const sourceLocations = useMemo(() => locations
    .filter((item) => item.location?.trim())
    .map((item) => ({ ...item, location: item.location!.trim(), count: Math.max(0, Number(item._count?._all ?? 0)) }))
    .sort((a, b) => b.count - a.count || a.location.localeCompare(b.location)), [locations]);

  const areaGroups = useMemo<AreaGroup[]>(() => {
    const groups = new Map<string, { area: string; count: number; addresses: string[]; latSum: number; lngSum: number }>();
    for (const item of mapped) {
      const key = normalize(item.geo.area);
      const current = groups.get(key);
      if (current) {
        current.count += item.count;
        current.addresses.push(item.geo.formattedAddress);
        current.latSum += item.geo.lat;
        current.lngSum += item.geo.lng;
      } else {
        groups.set(key, { area: item.geo.area, count: item.count, addresses: [item.geo.formattedAddress], latSum: item.geo.lat, lngSum: item.geo.lng });
      }
    }
    return [...groups.values()]
      .map((group) => ({
        area: group.area,
        count: group.count,
        addressCount: group.addresses.length,
        center: { lat: group.latSum / group.addresses.length, lng: group.lngSum / group.addresses.length },
        addresses: [...new Set(group.addresses)].slice(0, 8)
      }))
      .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area));
  }, [mapped]);

  const totalOrders = sourceLocations.reduce((sum, item) => sum + item.count, 0);
  const mappedOrders = mapped.reduce((sum, item) => sum + item.count, 0);
  const coverage = totalOrders > 0 ? Math.round((mappedOrders / totalOrders) * 100) : 0;

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
    mapRef.current = new maps.Map(mapElementRef.current, {
      center: DEFAULT_CENTER,
      zoom: 11,
      styles: DARK_MAP_STYLES,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      clickableIcons: false,
      gestureHandling: "greedy",
      backgroundColor: "#0b1220"
    });
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
        const next: MappedLocation[] = [];
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
    if (!areaGroups.length) { map.setCenter(DEFAULT_CENTER); map.setZoom(11); return; }
    const bounds = new maps.LatLngBounds();
    areaGroups.forEach((group, index) => {
      const position = group.center;
      const marker = new maps.Marker({
        map,
        position,
        zIndex: 1000 - index,
        title: group.area + " • " + group.count + " orders • " + group.addressCount + " locations",
        icon: { path: maps.SymbolPath.CIRCLE, scale: Math.min(24, 9 + Math.min(group.count, 50) * 0.32), fillColor: "#F4581D", fillOpacity: 0.9, strokeColor: "#08101d", strokeWeight: 4 },
        label: { text: String(group.count), color: "#FFFFFF", fontSize: "11px", fontWeight: "800" }
      });
      marker.addListener("click", () => {
        const addressList = group.addresses.slice(0, 5).map((address) => "<div style=\"margin-top:4px\">• " + escapeHtml(address) + "</div>").join("");
        infoWindowRef.current?.setContent("<div style=\"min-width:240px;max-width:310px;padding:6px 4px;font-family:Inter,system-ui,sans-serif\"><div style=\"font-size:14px;font-weight:900;color:#172139\">" + escapeHtml(group.area) + "</div><div style=\"margin-top:5px;font-size:12px;color:#475569\">" + group.count + " orders across " + group.addressCount + " mapped locations</div><div style=\"margin-top:9px;font-size:11px;line-height:1.45;color:#64748b\">" + addressList + "</div></div>");
        infoWindowRef.current?.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
      bounds.extend(position);
    });
    if (areaGroups.length === 1) { map.setCenter(areaGroups[0].center); map.setZoom(13); }
    else map.fitBounds(bounds, 52);
  }, [areaGroups]);

  return (
    <Card className="min-w-0 overflow-hidden border-white/10 bg-[linear-gradient(145deg,rgba(10,16,28,0.98),rgba(17,25,41,0.98))] p-0 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
      <div className="h-[3px] w-full bg-[linear-gradient(90deg,#ff5b20,#ff9b54,#3dd6ff)]" />
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold tracking-tight">Customer Origin Intelligence</h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200"><Navigation size={11} /> Google Maps</span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-foreground/45">Every address is mapped, then grouped into geographic areas so you can see where demand is concentrated instead of tracking isolated pins.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2.5"><p className="text-[9px] font-bold uppercase tracking-wider text-foreground/35">Orders</p><p className="mt-1 text-lg font-semibold tabular-nums">{totalOrders}</p></div>
            <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2.5"><p className="text-[9px] font-bold uppercase tracking-wider text-foreground/35">Areas</p><p className="mt-1 text-lg font-semibold tabular-nums">{areaGroups.length}</p></div>
            <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2.5"><p className="text-[9px] font-bold uppercase tracking-wider text-foreground/35">Mapped</p><p className="mt-1 text-lg font-semibold tabular-nums text-cyan-200">{coverage}%</p></div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_360px]">
          <div className="relative min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] shadow-inner shadow-black/40">
            <div ref={mapElementRef} className="h-[430px] w-full sm:h-[500px]" />
            {!mapsReady ? <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[#0b1220] text-sm text-white/45"><Loader2 size={16} className="animate-spin" /> Loading dark map…</div> : null}
            {mapsReady && sourceLocations.length === 0 ? <div className="absolute inset-0 flex items-center justify-center bg-[#0b1220]/90 px-6 text-center"><div><MapPin className="mx-auto text-white/25" size={30} /><p className="mt-3 text-sm font-semibold text-white/65">No customer locations in this range yet.</p><p className="mt-1 text-xs text-white/35">Mapped demand will appear here as orders are recorded.</p></div></div> : null}
            {mapping ? <div className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#101a2b]/90 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/65 shadow-lg"><Loader2 size={13} className="animate-spin text-accent" /> Mapping {mapped.length}/{sourceLocations.length}</div> : null}
            {mapError ? <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-red-300/15 bg-[#101827]/95 px-3 py-2 text-xs font-medium text-red-100 shadow-lg">{mapError}</div> : null}
            <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/10 bg-[#101827]/90 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/65 shadow-sm">Bubble size = order volume</div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025]">
            <div className="border-b border-white/8 px-4 py-3.5">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Grouped demand</p><p className="mt-1 text-sm font-semibold text-white/80">All mapped areas</p></div><UsersRound size={16} className="text-cyan-200" /></div>
            </div>
            <div className="max-h-[440px] overflow-y-auto p-3">
              {areaGroups.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-xs text-white/35">No mapped areas yet.</div> : areaGroups.map((group, index) => {
                const share = totalOrders > 0 ? Math.round((group.count / totalOrders) * 100) : 0;
                return <div key={group.area + "-" + index} className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-3"><div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[linear-gradient(135deg,#ff5b20,#ff9b54)] text-[10px] font-extrabold text-white">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-white/85">{group.area}</p><span className="shrink-0 text-xs font-bold tabular-nums text-cyan-200">{group.count}</span></div><div className="mt-1 text-[10px] text-white/35">{group.addressCount} mapped location{group.addressCount === 1 ? "" : "s"} · {share}% of orders</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-[linear-gradient(90deg,#ff5b20,#ff9b54)]" style={{ width: Math.max(4, share) + "%" }} /></div></div></div></div>;
              })}
            </div>
            <div className="border-t border-white/8 px-4 py-3 text-[10px] leading-4 text-white/35">{mapped.length} distinct mapped addresses grouped into {areaGroups.length} geographic areas. Cached geocodes are reused to reduce repeat lookups.</div>
          </div>
        </div>
      </div>
    </Card>
  );
}