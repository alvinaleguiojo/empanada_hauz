"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, MapPin, Navigation, Radio, Store, Home } from "lucide-react";

type Coordinate = { latitude: number; longitude: number };

type RiderJob = {
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
  order?: { orderNumber: string; quantity?: number; customer: { name: string; phoneNumber?: string | null } } | null;
};

const DEFAULT_CENTER: Coordinate = { latitude: 10.3157, longitude: 123.8854 };

declare global {
  interface Window {
    L?: any;
  }
}

function valid(point?: Coordinate | null): point is Coordinate {
  return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

function loadLeaflet() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.L) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-empanada-leaflet]");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Unable to load map library")), { once: true });
      return;
    }

    if (!document.querySelector("link[data-empanada-leaflet-css]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.dataset.empanadaLeafletCss = "true";
      document.head.appendChild(link);
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.dataset.empanadaLeaflet = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load map library"));
    document.body.appendChild(script);
  });
}

export function RiderMap({ job, riderLocation, locationEnabled, onLocate }: {
  job: RiderJob | null;
  riderLocation: Coordinate | null;
  locationEnabled: boolean;
  onLocate: () => void;
}) {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const pickup = useMemo(
    () => job && valid({ latitude: Number(job.pickupLatitude), longitude: Number(job.pickupLongitude) })
      ? { latitude: Number(job.pickupLatitude), longitude: Number(job.pickupLongitude) }
      : null,
    [job]
  );
  const dropoff = useMemo(
    () => job && valid({ latitude: Number(job.dropoffLatitude), longitude: Number(job.dropoffLongitude) })
      ? { latitude: Number(job.dropoffLatitude), longitude: Number(job.dropoffLongitude) }
      : null,
    [job]
  );
  const goingToDropoff = Boolean(job && ["picked_up", "delivering"].includes(job.status));
  const destination = goingToDropoff ? dropoff : pickup ?? dropoff;

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then(() => {
        if (cancelled || !mapElement.current || mapRef.current || !window.L) return;
        const L = window.L;
        const map = L.map(mapElement.current, { zoomControl: false, attributionControl: true }).setView([DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude], 13);
        L.control.zoom({ position: "bottomright" }).addTo(map);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        mapRef.current = map;
        setMapReady(true);
      })
      .catch((err) => setMapError(err instanceof Error ? err.message : "Unable to load map"));

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.L) return;
    const L = window.L;
    const map = mapRef.current;
    layersRef.current.forEach((layer) => layer.remove());
    layersRef.current = [];

    const makeIcon = (background: string, glyph: string) => L.divIcon({
      className: "empanada-map-icon",
      html: `<div style="width:42px;height:42px;border-radius:14px;background:${background};display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(15,23,42,.22);border:3px solid white;font-size:18px">${glyph}</div>`,
      iconSize: [42, 42],
      iconAnchor: [21, 21]
    });

    const points: Coordinate[] = [];
    if (valid(riderLocation)) {
      const marker = L.marker([riderLocation.latitude, riderLocation.longitude], {
        icon: makeIcon("#0f172a", "🏍️")
      }).bindTooltip("You", { direction: "top", offset: [0, -18] }).addTo(map);
      layersRef.current.push(marker);
      points.push(riderLocation);
    }
    if (valid(pickup)) {
      const marker = L.marker([pickup.latitude, pickup.longitude], {
        icon: makeIcon("#f97316", "🏪")
      }).bindTooltip("Pickup", { direction: "top", offset: [0, -18] }).addTo(map);
      layersRef.current.push(marker);
      points.push(pickup);
    }
    if (valid(dropoff)) {
      const marker = L.marker([dropoff.latitude, dropoff.longitude], {
        icon: makeIcon("#dc2626", "🏠")
      }).bindTooltip("Drop-off", { direction: "top", offset: [0, -18] }).addTo(map);
      layersRef.current.push(marker);
      points.push(dropoff);
    }

    if (points.length > 1) {
      const latLngs = points.map((point) => [point.latitude, point.longitude]);
      const route = L.polyline(latLngs, { color: "#f97316", weight: 5, opacity: 0.82, dashArray: "10 8" }).addTo(map);
      layersRef.current.push(route);
      map.fitBounds(L.latLngBounds(latLngs), { padding: [44, 44], maxZoom: 15 });
    } else if (destination) {
      map.setView([destination.latitude, destination.longitude], 15);
    } else if (riderLocation) {
      map.setView([riderLocation.latitude, riderLocation.longitude], 15);
    }

    window.setTimeout(() => map.invalidateSize(), 100);
  }, [dropoff, destination, mapReady, pickup, riderLocation]);

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-[28px] bg-slate-200">
      <div ref={mapElement} className="absolute inset-0 z-0" />

      <div className="absolute left-4 top-4 z-[500] rounded-2xl bg-white/95 px-3 py-2 shadow-lg ring-1 ring-slate-200 backdrop-blur">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Radio size={14} className={locationEnabled ? "text-emerald-600" : "text-slate-400"} />
          {locationEnabled ? "Live location" : "Location off"}
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">{goingToDropoff ? "Heading to customer" : "Heading to pickup"}</p>
      </div>

      <button
        type="button"
        onClick={onLocate}
        className="absolute bottom-4 right-4 z-[500] flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-lg ring-1 ring-slate-200 hover:bg-slate-50"
        aria-label="Center on my location"
      >
        <LocateFixed size={19} />
      </button>

      {mapError ? (
        <div className="absolute inset-0 z-[450] grid place-items-center bg-slate-100 p-6 text-center">
          <div>
            <MapPin className="mx-auto text-slate-400" />
            <p className="mt-2 text-sm font-semibold text-slate-700">Map unavailable</p>
            <p className="mt-1 text-xs text-slate-500">{mapError}</p>
          </div>
        </div>
      ) : null}

      {job ? (
        <div className="absolute bottom-4 left-4 z-[500] max-w-[calc(100%-88px)] rounded-2xl bg-white/95 px-4 py-3 shadow-xl ring-1 ring-slate-200 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-orange-50 p-2 text-orange-600"><Navigation size={15} /></div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-900">{goingToDropoff ? job.order?.customer.name ?? "Customer" : "Empanada Hauz – Main Branch"}</p>
              <p className="truncate text-[11px] text-slate-500">{goingToDropoff ? job.dropoffAddress : job.pickupAddress}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
            {job.distanceKm != null ? <span>{job.distanceKm.toFixed(1)} km</span> : null}
            {job.estimatedDurationMinutes != null ? <span>· {job.estimatedDurationMinutes} min</span> : null}
            {job.estimatedFare != null ? <span>· ₱{Number(job.finalFare ?? job.estimatedFare).toFixed(0)}</span> : null}
          </div>
        </div>
      ) : null}

      {!job && !mapError ? (
        <div className="absolute inset-x-0 bottom-4 z-[500] mx-4 rounded-2xl bg-white/95 p-4 text-center shadow-xl ring-1 ring-slate-200 backdrop-blur">
          <Store className="mx-auto text-slate-400" size={20} />
          <p className="mt-2 text-sm font-bold text-slate-700">No active delivery</p>
          <p className="mt-1 text-xs text-slate-500">Go online to receive your next route.</p>
        </div>
      ) : null}
    </div>
  );
}
