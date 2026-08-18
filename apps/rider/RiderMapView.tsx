import { useEffect, useRef, useState } from "react";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

const DIRECTIONS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY;
const REROUTE_METERS = 60;

type Coordinate = { latitude: number; longitude: number };

type RiderMapViewProps = {
  riderLocation?: Coordinate | null;
  pickup?: Coordinate | null;
  dropoff?: Coordinate | null;
  pickupAddress?: string;
  dropoffAddress?: string;
  onClose?: () => void;
};

function regionFor(points: Coordinate[]): Region {
  const valid = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  if (!valid.length) return { latitude: 10.3157, longitude: 123.8854, latitudeDelta: 0.08, longitudeDelta: 0.08 };
  const latitudes = valid.map((point) => point.latitude);
  const longitudes = valid.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat, 0.015) * 1.7,
    longitudeDelta: Math.max(maxLng - minLng, 0.015) * 1.7
  };
}

// Distance in meters between two coordinates (haversine), used only to
// decide whether the rider has moved far enough to justify a re-route call.
function metersBetween(a: Coordinate, b: Coordinate) {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Standard Google encoded-polyline decoder.
function decodePolyline(encoded: string): Coordinate[] {
  const points: Coordinate[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

async function fetchDirections(origin: Coordinate, destination: Coordinate, waypoint?: Coordinate | null) {
  if (!DIRECTIONS_API_KEY) return null;
  const params = new URLSearchParams({
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    key: DIRECTIONS_API_KEY
  });
  if (waypoint) params.set("waypoints", `${waypoint.latitude},${waypoint.longitude}`);
  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
  if (!response.ok) return null;
  const data = await response.json();
  const route = data?.routes?.[0];
  if (!route) return null;
  const coordinates = route.legs.flatMap((leg: any) => decodePolyline(leg.steps.map((step: any) => step.polyline.points).join("")));
  const distanceMeters = route.legs.reduce((sum: number, leg: any) => sum + (leg.distance?.value ?? 0), 0);
  const durationText = route.legs.map((leg: any) => leg.duration?.text).filter(Boolean).join(" + ");
  return { coordinates, distanceKm: distanceMeters / 1000, durationText };
}

export default function RiderMapView({ riderLocation, pickup, dropoff, pickupAddress, dropoffAddress, onClose }: RiderMapViewProps) {
  const points = [riderLocation, pickup, dropoff].filter(Boolean) as Coordinate[];
  const straightLineRoute = [riderLocation, pickup, dropoff].filter(Boolean) as Coordinate[];
  const hasDelivery = Boolean(pickup || dropoff);

  const [routedPath, setRoutedPath] = useState<Coordinate[] | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationText: string } | null>(null);
  const [routing, setRouting] = useState(false);
  const [following, setFollowing] = useState(true);
  const lastRoutedFromRef = useRef<Coordinate | null>(null);
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    const destination = dropoff ?? pickup ?? null;
    const origin = riderLocation ?? pickup ?? null;
    if (!DIRECTIONS_API_KEY || !origin || !destination) {
      setRoutedPath(null);
      setRouteInfo(null);
      return;
    }

    const lastFrom = lastRoutedFromRef.current;
    if (lastFrom && metersBetween(lastFrom, origin) < REROUTE_METERS) return;

    let cancelled = false;
    setRouting(true);
    const waypoint = pickup && destination !== pickup ? pickup : null;
    fetchDirections(origin, destination, waypoint)
      .then((result) => {
        if (cancelled || !result) return;
        lastRoutedFromRef.current = origin;
        setRoutedPath(result.coordinates);
        setRouteInfo({ distanceKm: result.distanceKm, durationText: result.durationText });
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setRouting(false); });

    return () => { cancelled = true; };
  }, [riderLocation?.latitude, riderLocation?.longitude, pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude]);

  const displayRoute = routedPath && routedPath.length > 1 ? routedPath : straightLineRoute;

  // Follow the rider like a driving app: keep the camera centered on their
  // live position as it streams in, but stop the moment the person manually
  // pans the map, so we're not fighting their own gesture. A "Recenter"
  // button lets them jump back to follow mode.
  useEffect(() => {
    if (!following || !riderLocation) return;
    mapRef.current?.animateToRegion(
      { latitude: riderLocation.latitude, longitude: riderLocation.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      500
    );
  }, [following, riderLocation?.latitude, riderLocation?.longitude]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(points)}
        showsUserLocation={Boolean(riderLocation)}
        showsMyLocationButton={false}
        onPanDrag={() => setFollowing(false)}
      >
        {riderLocation ? <Marker coordinate={riderLocation} title="You" pinColor="#ff5a1f" /> : null}
        {pickup ? <Marker coordinate={pickup} title="Pickup" description={pickupAddress} pinColor="#ff7a00" /> : null}
        {dropoff ? <Marker coordinate={dropoff} title="Drop-off" description={dropoffAddress} pinColor="#ef3f23" /> : null}
        {displayRoute.length > 1 ? (
          <Polyline coordinates={displayRoute} strokeColor="#ff5a1f" strokeWidth={5} lineDashPattern={routedPath ? undefined : [1]} />
        ) : null}
      </MapView>

      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>EMPANADA HAUZ</Text>
          <Text style={styles.online}>● Online</Text>
        </View>
        {onClose ? <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close map"><Text style={styles.closeText}>×</Text></Pressable> : null}
      </View>

      <View style={styles.controls}>
        {!following && riderLocation ? (
          <Pressable onPress={() => setFollowing(true)} style={styles.control} accessibilityLabel="Recenter on my location">
            <Text style={styles.controlText}>⌖</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.routeHint}>
        <Text style={styles.routeIcon}>▣</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.routeTitle}>{hasDelivery ? "Current delivery route" : "Waiting for delivery"}</Text>
          <Text style={styles.routeSubtitle}>
            {routeInfo
              ? `${routeInfo.distanceKm.toFixed(1)} km  •  ${routeInfo.durationText}`
              : routing
              ? "Calculating route…"
              : hasDelivery
              ? "Pickup → Drop-off"
              : "Your assigned delivery will appear here"}
          </Text>
        </View>
        {routing ? <ActivityIndicator size="small" color="#ff5a1f" /> : null}
      </View>
    </View>
  );
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricIcon}>{icon}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Stop({ icon, label, address }: { icon: string; label: string; address: string }) {
  return <View style={styles.stop}><View style={styles.stopIcon}><Text style={styles.stopIconText}>{icon}</Text></View><View style={{ flex: 1 }}><Text style={styles.stopLabel}>{label}</Text><Text style={styles.stopAddress} numberOfLines={2}>{address}</Text></View></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f2e9" },
  topBar: { position: "absolute", top: 14, left: 14, right: 14, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: "rgba(255,255,255,0.96)", flexDirection: "row", justifyContent: "space-between", alignItems: "center", elevation: 7, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  brand: { color: "#3b1c12", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },
  online: { color: "#16834a", fontWeight: "800", marginTop: 2, fontSize: 12 },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#ff5a1f", alignItems: "center", justifyContent: "center" },
  closeText: { color: "#fff", fontSize: 27, lineHeight: 29, fontWeight: "500" },
  metric: { flex: 1, alignItems: "center", borderRightWidth: 1, borderRightColor: "#eee7dc" },
  metricIcon: { color: "#ff5a1f", fontWeight: "900", fontSize: 16 },
  metricValue: { color: "#261711", fontWeight: "900", fontSize: 18, marginTop: 2 },
  metricLabel: { color: "#766d66", fontSize: 9, marginTop: 2, textAlign: "center" },
  controls: { position: "absolute", right: 16, bottom: 132, gap: 10 },
  control: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: "#000", shadowOpacity: 0.13, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  controlText: { color: "#ff5a1f", fontSize: 24, fontWeight: "800" },
  routeHint: { position: "absolute", left: 16, right: 16, bottom: 20, backgroundColor: "rgba(255,255,255,0.96)", borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  routeIcon: { color: "#ff5a1f", fontSize: 24, marginRight: 10 },
  routeTitle: { color: "#2d1b15", fontWeight: "900", fontSize: 14 },
  routeSubtitle: { color: "#766d66", fontSize: 11, marginTop: 2 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#fffaf3", borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 18, paddingBottom: 28, elevation: 12, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: -4 } },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: "#e5ddd2", alignSelf: "center", marginBottom: 14 },
  sheetHeader: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  orderBadge: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#ff5a1f", alignItems: "center", justifyContent: "center", marginRight: 11 },
  orderBadgeText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  orderTitle: { color: "#2b1811", fontWeight: "900", fontSize: 17 },
  orderSubtitle: { color: "#7b716a", fontSize: 11, marginTop: 3 },
  statusPill: { backgroundColor: "#fff0e8", paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14 },
  statusText: { color: "#ef5520", fontWeight: "900", fontSize: 11 },
  stop: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "#f0e8de", borderRadius: 15, padding: 11, marginBottom: 8 },
  stopIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#fff0e8", alignItems: "center", justifyContent: "center", marginRight: 10 },
  stopIconText: { color: "#ff5a1f", fontWeight: "900" },
  stopLabel: { color: "#a09288", fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  stopAddress: { color: "#342018", fontWeight: "700", fontSize: 13, marginTop: 2 },
  navigateButton: { height: 56, borderRadius: 18, backgroundColor: "#ff5a1f", alignItems: "center", justifyContent: "center", flexDirection: "row", marginTop: 6 },
  navigateDisabled: { backgroundColor: "#c8c1ba" },
  navigateIcon: { color: "#fff", fontSize: 20, marginRight: 9 },
  navigateText: { color: "#fff", fontWeight: "900", fontSize: 16 }
});
