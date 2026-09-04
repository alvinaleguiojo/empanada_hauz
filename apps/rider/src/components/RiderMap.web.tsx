import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Coordinate } from "../types";
import { colors } from "../theme";

export type RiderMapHandle = { recenter: () => void };
type Props = { region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }; riderLocation: Coordinate | null; pickup: Coordinate | null; dropoff: Coordinate | null; destination: Coordinate | null };
type GoogleMaps = typeof globalThis & { google?: any };
let mapsLoader: Promise<any> | null = null;

function loadGoogleMaps() {
  if ((window as GoogleMaps).google?.maps) return Promise.resolve((window as GoogleMaps).google.maps);
  if (mapsLoader) return mapsLoader;
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
  if (!key) return Promise.reject(new Error("Google Maps API key is not configured for rider web."));
  mapsLoader = new Promise((resolve, reject) => {
    const existing = document.getElementById("empanada-google-maps") as HTMLScriptElement | null;
    if (existing) { existing.addEventListener("load", () => resolve((window as GoogleMaps).google.maps)); existing.addEventListener("error", reject); return; }
    const script = document.createElement("script"); script.id = "empanada-google-maps"; script.async = true; script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
    script.onload = () => resolve((window as GoogleMaps).google.maps); script.onerror = () => reject(new Error("Unable to load Google Maps.")); document.head.appendChild(script);
  });
  return mapsLoader;
}
function point(value: Coordinate | null) { return value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) ? { lat: value.latitude, lng: value.longitude } : null; }

export const RiderMap = forwardRef<RiderMapHandle, Props>(function RiderMap({ region, riderLocation, pickup, dropoff, destination }, ref) {
  const mapElement = useRef<HTMLDivElement | null>(null), mapRef = useRef<any>(null), directionsRef = useRef<any>(null), markersRef = useRef<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fitCurrentBounds = () => { if (mapRef.current) mapRef.current.fitBounds(boundsFor([riderLocation, pickup, dropoff]), 56); };
  useImperativeHandle(ref, () => ({ recenter: fitCurrentBounds }), [riderLocation, pickup, dropoff]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !mapElement.current) return;
      const map = new maps.Map(mapElement.current, { center: { lat: region.latitude, lng: region.longitude }, zoom: zoomFor(region.latitudeDelta, region.longitudeDelta), mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, backgroundColor: "#E8EDF2" });
      mapRef.current = map;
      directionsRef.current = new maps.DirectionsRenderer({ map, suppressMarkers: true, polylineOptions: { strokeColor: colors.orange, strokeOpacity: 0.95, strokeWeight: 5 } });
      setError(null);
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Map unavailable"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const map = mapRef.current, maps = (window as GoogleMaps).google?.maps;
    if (!map || !maps) return;
    markersRef.current.forEach((marker) => marker.setMap(null)); markersRef.current = [];
    const addMarker = (location: Coordinate | null, title: string) => {
      const p = point(location); if (!p) return;
      const marker = new maps.Marker({ map, position: p, title, zIndex: title === "You" ? 3 : 2 });
      marker.setIcon({ path: maps.SymbolPath.CIRCLE, scale: title === "You" ? 9 : 13, fillColor: title === "You" ? "#FFFFFF" : title === "Pickup" ? colors.orange : colors.red, fillOpacity: 1, strokeColor: title === "You" ? colors.orange : "#FFFFFF", strokeWeight: 3 });
      markersRef.current.push(marker);
    };
    addMarker(riderLocation, "You"); addMarker(pickup, "Pickup"); addMarker(dropoff, "Drop-off");
    const origin = point(riderLocation) || point(pickup), end = point(destination) || point(dropoff);
    if (!origin || !end) { directionsRef.current?.setDirections({ routes: [] }); map.setCenter({ lat: region.latitude, lng: region.longitude }); return; }
    new maps.DirectionsService().route({ origin, destination: end, travelMode: maps.TravelMode.DRIVING }, (result: any, status: string) => {
      if (status === "OK" && result) { directionsRef.current?.setDirections(result); map.fitBounds(result.routes[0].bounds, 56); setError(null); }
      else setError("Road route is unavailable for this delivery.");
    });
  }, [riderLocation?.latitude, riderLocation?.longitude, pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude, destination?.latitude, destination?.longitude, region.latitude, region.longitude]);

  return <View style={styles.wrap}><View ref={mapElement as any} style={styles.map} />{error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}<Pressable style={styles.recenter} onPress={fitCurrentBounds}><Text style={styles.recenterText}>◎</Text></Pressable></View>;
});
function boundsFor(points: Array<Coordinate | null>) { const maps = (window as GoogleMaps).google?.maps; const bounds = new maps.LatLngBounds(); points.filter((p): p is Coordinate => !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude })); return bounds; }
function zoomFor(latDelta: number, lngDelta: number) { return Math.max(10, Math.min(17, Math.round(Math.log2(360 / Math.max(latDelta, lngDelta))))); }
const styles = StyleSheet.create({ wrap: { flex: 1, backgroundColor: "#E8EDF2", position: "relative" }, map: { position: "absolute", inset: 0, width: "100%", height: "100%" } as any, recenter: { position: "absolute", right: 12, top: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", elevation: 4 }, recenterText: { fontSize: 18, color: colors.ink }, error: { position: "absolute", left: 12, right: 64, bottom: 12, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.94)" }, errorText: { color: colors.body, fontSize: 11, fontWeight: "700" } });
