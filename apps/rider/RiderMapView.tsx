import { useEffect, useMemo, useRef, useState } from "react";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

const DIRECTIONS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
type Coordinate = { latitude: number; longitude: number };
type Props = { riderLocation?: Coordinate | null; status?: string; pickup?: Coordinate | null; dropoff?: Coordinate | null; pickupAddress?: string; dropoffAddress?: string; onClose?: () => void; simulateNavigation?: boolean };
type RouteInfo = { points: Coordinate[]; distance: number; duration: string; originLabel: string };
const valid = (p?: Coordinate | null): p is Coordinate => !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

function initialRegion(points: Coordinate[]): Region {
  const p = points.filter(valid);
  if (!p.length) return { latitude: 10.3157, longitude: 123.8854, latitudeDelta: 0.08, longitudeDelta: 0.08 };
  const minLat = Math.min(...p.map(x => x.latitude)); const maxLat = Math.max(...p.map(x => x.latitude)); const minLng = Math.min(...p.map(x => x.longitude)); const maxLng = Math.max(...p.map(x => x.longitude));
  return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, latitudeDelta: Math.max(0.012, (maxLat - minLat) * 1.5), longitudeDelta: Math.max(0.012, (maxLng - minLng) * 1.5) };
}
function decodePolyline(encoded: string): Coordinate[] {
  let index = 0, lat = 0, lng = 0; const points: Coordinate[] = [];
  while (index < encoded.length) {
    let b = 0, shift = 0, result = 0; do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20); lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0; do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20); lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}
function distanceKm(a: Coordinate, b: Coordinate) {
  const r = 6371; const dLat = (b.latitude - a.latitude) * Math.PI / 180; const dLng = (b.longitude - a.longitude) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function pointAtProgress(points: Coordinate[], progress: number): Coordinate {
  if (points.length < 2) return points[0] ?? { latitude: 10.3157, longitude: 123.8854 };
  const target = Math.max(0, Math.min(1, progress));
  const segments = points.slice(0, -1).map((point, index) => ({ from: point, to: points[index + 1], km: distanceKm(point, points[index + 1]) }));
  const total = segments.reduce((sum, segment) => sum + segment.km, 0) || 1;
  let travelled = total * target;
  for (const segment of segments) {
    if (travelled <= segment.km) {
      const ratio = segment.km ? travelled / segment.km : 0;
      return { latitude: segment.from.latitude + (segment.to.latitude - segment.from.latitude) * ratio, longitude: segment.from.longitude + (segment.to.longitude - segment.from.longitude) * ratio };
    }
    travelled -= segment.km;
  }
  return points[points.length - 1];
}
async function getRoute(origin: Coordinate, destination: Coordinate, originLabel = "Rider"): Promise<RouteInfo> {
  if (!DIRECTIONS_API_KEY) throw new Error("Road routing is not configured. The map and markers remain available.");
  const params = new URLSearchParams({ origin: `${origin.latitude},${origin.longitude}`, destination: `${destination.latitude},${destination.longitude}`, mode: "driving", key: DIRECTIONS_API_KEY });
  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`); const data = await response.json();
  if (!response.ok || data.status !== "OK" || !data.routes?.[0]) {
    const error = new Error(data.error_message || data.status || "Unable to calculate route.");
    (error as Error & { code?: string }).code = data.status;
    throw error;
  }
  const route = data.routes[0]; const legs = route.legs ?? []; const distance = legs.reduce((sum: number, leg: any) => sum + Number(leg.distance?.value ?? 0), 0) / 1000; const duration = legs.map((leg: any) => leg.duration?.text).filter(Boolean).join(" • "); const points = decodePolyline(route.overview_polyline?.points ?? "");
  if (points.length < 2) throw new Error("Google returned an empty route."); return { points, distance, duration, originLabel };
}

export default function RiderMapView({ riderLocation, status, pickup, dropoff, pickupAddress, dropoffAddress, onClose, simulateNavigation = false }: Props) {
  const map = useRef<MapView>(null); const [path, setPath] = useState<Coordinate[]>([]); const [info, setInfo] = useState<RouteInfo | null>(null); const [loading, setLoading] = useState(false); const [following, setFollowing] = useState(false); const [routeError, setRouteError] = useState<string | null>(null); const [mapError, setMapError] = useState(false); const [simulatedLocation, setSimulatedLocation] = useState<Coordinate | null>(null);
  const lastRouteOrigin = useRef<Coordinate | null>(null); const lastRouteDestination = useRef<Coordinate | null>(null);
  const goingToDropoff = ["picked_up", "delivering"].includes(status ?? "");
  const origin = valid(riderLocation) ? riderLocation : null;
  const displayRiderLocation = simulateNavigation && valid(simulatedLocation) ? simulatedLocation : riderLocation;
  const destination = goingToDropoff ? (valid(dropoff) ? dropoff : null) : (valid(pickup) ? pickup : valid(dropoff) ? dropoff : null);
  const mapPoints = useMemo(() => [riderLocation, pickup, dropoff].filter(valid), [riderLocation, pickup, dropoff]);
  const activeAddress = goingToDropoff ? dropoffAddress : pickupAddress;
  const activeLabel = goingToDropoff ? "Drop-off" : valid(pickup) ? "Pickup" : "Delivery";

  const fitRoute = () => { if (mapPoints.length) map.current?.fitToCoordinates(mapPoints, { edgePadding: { top: 180, right: 50, bottom: 290, left: 50 }, animated: true }); };
  useEffect(() => { requestAnimationFrame(fitRoute); }, [riderLocation?.latitude, riderLocation?.longitude, pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude, status]);

  useEffect(() => {
    if (!destination) { setPath([]); setInfo(null); setRouteError("Waiting for destination coordinates."); lastRouteOrigin.current = null; lastRouteDestination.current = null; return; }
    if (!DIRECTIONS_API_KEY) { setPath([]); setInfo(null); setRouteError("Road routing is not configured. Map markers and locations are still available."); return; }
    if (origin && lastRouteOrigin.current && lastRouteDestination.current && Math.abs(lastRouteDestination.current.latitude - destination.latitude) < 0.00001 && Math.abs(lastRouteDestination.current.longitude - destination.longitude) < 0.00001 && distanceKm(lastRouteOrigin.current, origin) < 0.15 && path.length > 1) return;
    let cancelled = false; setLoading(true); setRouteError(null);
    const loadRoute = async () => {
      try {
        if (origin) {
          const result = await getRoute(origin, destination, "Rider");
          if (!cancelled) { setPath(result.points); setInfo(result); lastRouteOrigin.current = origin; lastRouteDestination.current = destination; }
          return;
        }
        throw new Error("RIDER_LOCATION_MISSING");
      } catch (error) {
        if (!goingToDropoff && valid(pickup) && valid(dropoff)) {
          try {
            const fallback = await getRoute(pickup, dropoff, "Pickup");
            if (!cancelled) { setPath(fallback.points); setInfo(fallback); lastRouteOrigin.current = pickup; lastRouteDestination.current = dropoff; setRouteError("Rider GPS is unavailable. Showing the pickup → drop-off road route."); }
            return;
          } catch { /* report the original problem below */ }
        }
        if (!cancelled) {
          setPath([]); setInfo(null);
          const code = (error as Error & { code?: string })?.code;
          setRouteError(code === "REQUEST_DENIED" ? "Google Directions rejected the request. Check the Directions API key and restrictions." : code === "ZERO_RESULTS" ? "No road route is available from the current GPS position. Check the rider GPS location." : error instanceof Error ? error.message : "Unable to calculate route.");
        }
      } finally { if (!cancelled) setLoading(false); }
    };
    void loadRoute();
    return () => { cancelled = true; };
  }, [riderLocation?.latitude, riderLocation?.longitude, destination?.latitude, destination?.longitude, status, pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude, goingToDropoff, path.length]);

  useEffect(() => {
    if (!simulateNavigation || path.length < 2 || !destination) { setSimulatedLocation(null); return; }
    let cancelled = false; const startedAt = Date.now(); const routeKm = info?.distance ?? path.slice(0, -1).reduce((sum, point, index) => sum + distanceKm(point, path[index + 1]), 0); const durationMs = Math.min(90000, Math.max(30000, routeKm * 1000 / 4 * 1000));
    setFollowing(true); setSimulatedLocation(path[0]);
    const timer = setInterval(() => {
      if (cancelled) return;
      const progress = Math.min(1, (Date.now() - startedAt) / durationMs); const next = pointAtProgress(path, progress); setSimulatedLocation(next);
      map.current?.animateToRegion({ latitude: next.latitude, longitude: next.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 450);
      if (progress >= 1) clearInterval(timer);
    }, 700);
    return () => { cancelled = true; clearInterval(timer); };
  }, [simulateNavigation, path, destination?.latitude, destination?.longitude, info?.distance]);

  useEffect(() => { if (following && valid(displayRiderLocation)) map.current?.animateToRegion({ latitude: displayRiderLocation.latitude, longitude: displayRiderLocation.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 450); }, [following, displayRiderLocation?.latitude, displayRiderLocation?.longitude]);

  return <View style={s.container}>
    <MapView ref={map} style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE} mapType="standard" initialRegion={initialRegion(mapPoints)} showsUserLocation={false} showsMyLocationButton={false} onMapReady={() => { setMapError(false); requestAnimationFrame(fitRoute); }} onMapLoaded={() => setMapError(false)} onError={() => setMapError(true)} onPanDrag={() => setFollowing(false)}>
      {valid(displayRiderLocation) ? <Marker coordinate={displayRiderLocation} title="You"><View style={s.riderDot}><View style={s.riderArrow} /></View></Marker> : null}
      {valid(pickup) ? <Marker coordinate={pickup} title="Pickup" description={pickupAddress}><View style={s.pick}><Text style={s.markerText}>▣</Text></View></Marker> : null}
      {valid(dropoff) ? <Marker coordinate={dropoff} title="Drop-off" description={dropoffAddress}><View style={s.drop}><Text style={s.markerText}>⌂</Text></View></Marker> : null}
      {path.length > 1 ? <Polyline coordinates={path} strokeColor="#ff4a14" strokeWidth={7} lineCap="round" lineJoin="round" /> : null}
    </MapView>

    {mapError ? <View style={s.mapError}><Text style={s.mapErrorTitle}>Map could not be loaded</Text><Text style={s.mapErrorText}>Check the Google Maps SDK key, Maps SDK for Android/iOS, and the app package restriction.</Text><Pressable onPress={() => { setMapError(false); map.current?.animateToRegion(initialRegion(mapPoints), 450); }} style={s.retry}><Text style={s.retryText}>Retry</Text></Pressable></View> : null}

    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onClose} style={s.back}><Text style={s.backText}>‹</Text></Pressable>
      <Image source={require("../web/public/empanada hauz logo.jpg")} style={s.logo} resizeMode="contain" />
      <View style={s.online}><View style={s.green} /><Text style={s.onlineText}>Online</Text></View>
    </View>

    <View style={s.side}>
      {valid(displayRiderLocation) ? <Pressable style={s.round} onPress={() => { setFollowing(true); map.current?.animateToRegion({ latitude: displayRiderLocation.latitude, longitude: displayRiderLocation.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 450); }}><Text style={s.roundText}>⌖</Text></Pressable> : null}
      <Pressable style={s.round} onPress={fitRoute}><Text style={s.roundText}>◎</Text></Pressable>
    </View>

    {simulateNavigation ? <View style={s.navigation}><View style={s.navIcon}><Text style={s.navIconText}>➤</Text></View><View style={{ flex: 1 }}><Text style={s.navTitle}>Navigating to {activeLabel}</Text><Text style={s.navSub}>{info ? `${info.duration} • ${info.distance.toFixed(1)} km` : "Calculating road route…"}</Text></View><View style={s.livePill}><Text style={s.livePillText}>LIVE</Text></View></View> : null}

    <View style={s.current}><View style={s.orderNum}><Text style={s.orderNumText}>1</Text></View><View style={{ flex: 1 }}><View style={s.row}><Text style={s.currentTitle}>Current Order</Text><View style={s.pickPill}><Text style={s.pickPillText}>{activeLabel}</Text></View></View><Text style={s.address} numberOfLines={1}>{activeAddress ?? "Location pending"}</Text><Text style={s.sub}>{loading ? "Calculating road route…" : info ? `${info.originLabel} → ${activeLabel} • ${info.distance.toFixed(1)} km • ${info.duration}` : routeError ?? "Route unavailable"}</Text></View></View>

    {loading ? <View style={s.loading}><ActivityIndicator color="#ff4a14" /></View> : null}
    {routeError ? <View style={s.notice}><Text style={s.noticeText}>{routeError}</Text></View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Close map" onPress={onClose} style={s.close}><Text style={s.closeText}>×</Text></Pressable>
  </View>;
}

const s = StyleSheet.create({container:{flex:1,backgroundColor:"#ece7dc"},header:{position:"absolute",top:0,left:0,right:0,height:104,backgroundColor:"#ff5a12",borderBottomLeftRadius:32,borderBottomRightRadius:32,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:18,paddingTop:24,elevation:8},back:{width:44,height:44,borderRadius:22,backgroundColor:"rgba(255,255,255,.22)",alignItems:"center",justifyContent:"center"},backText:{color:"#fff",fontSize:40,lineHeight:38,fontWeight:"300",marginTop:-4},logo:{width:140,height:66,marginTop:2},online:{backgroundColor:"#fff",borderRadius:20,paddingHorizontal:12,paddingVertical:8,flexDirection:"row",alignItems:"center",gap:7},green:{width:10,height:10,borderRadius:5,backgroundColor:"#16a34a"},onlineText:{fontWeight:"800",color:"#252525",fontSize:13},side:{position:"absolute",right:20,top:220,gap:14},round:{width:58,height:58,borderRadius:29,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",elevation:5},roundText:{fontSize:28,color:"#ff4a14",fontWeight:"800"},current:{position:"absolute",top:128,left:18,right:18,backgroundColor:"rgba(255,255,255,.97)",borderRadius:22,padding:16,flexDirection:"row",gap:12,elevation:6},orderNum:{width:42,height:42,borderRadius:14,backgroundColor:"#ff4a14",alignItems:"center",justifyContent:"center"},orderNumText:{color:"#fff",fontSize:21,fontWeight:"900"},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},currentTitle:{color:"#df4618",fontSize:17,fontWeight:"900"},pickPill:{backgroundColor:"#262626",borderRadius:16,paddingHorizontal:10,paddingVertical:5},pickPillText:{color:"#fff",fontWeight:"800",fontSize:11},address:{color:"#252525",fontSize:15,fontWeight:"800",marginTop:4},sub:{color:"#777",fontSize:12,marginTop:4},navigation:{position:"absolute",top:240,left:18,right:18,backgroundColor:"#fff",borderRadius:18,padding:12,flexDirection:"row",alignItems:"center",gap:10,elevation:7},navIcon:{width:42,height:42,borderRadius:21,backgroundColor:"#ff4a14",alignItems:"center",justifyContent:"center"},navIconText:{color:"#fff",fontSize:20,fontWeight:"900"},navTitle:{fontSize:14,fontWeight:"900",color:"#222"},navSub:{fontSize:11,color:"#777",marginTop:2},livePill:{backgroundColor:"#16a34a",borderRadius:12,paddingHorizontal:8,paddingVertical:5},livePillText:{fontSize:9,fontWeight:"900",color:"#fff"},riderDot:{width:28,height:28,borderRadius:14,backgroundColor:"#ff4a14",borderWidth:4,borderColor:"#fff",alignItems:"center",justifyContent:"center"},riderArrow:{width:0,height:0,borderLeftWidth:5,borderRightWidth:5,borderBottomWidth:9,borderLeftColor:"transparent",borderRightColor:"transparent",borderBottomColor:"#fff"},pick:{width:50,height:50,borderRadius:25,backgroundColor:"#ff5a12",borderWidth:3,borderColor:"#fff",alignItems:"center",justifyContent:"center"},drop:{width:50,height:50,borderRadius:25,backgroundColor:"#ef3f23",borderWidth:3,borderColor:"#fff",alignItems:"center",justifyContent:"center"},markerText:{color:"#fff",fontSize:22,fontWeight:"900"},notice:{position:"absolute",left:20,right:70,bottom:26,backgroundColor:"rgba(255,255,255,.95)",borderRadius:14,paddingHorizontal:12,paddingVertical:8},noticeText:{color:"#8b5b3e",fontSize:11,fontWeight:"800"},loading:{position:"absolute",top:245,right:22,width:42,height:42,borderRadius:21,backgroundColor:"white",alignItems:"center",justifyContent:"center",elevation:5},mapError:{position:"absolute",left:24,right:24,top:"42%",backgroundColor:"rgba(255,255,255,.97)",borderRadius:18,padding:20,elevation:8,alignItems:"center"},mapErrorTitle:{fontSize:18,fontWeight:"900",color:"#222"},mapErrorText:{fontSize:13,lineHeight:19,color:"#666",textAlign:"center",marginTop:8},retry:{marginTop:14,paddingHorizontal:22,paddingVertical:10,borderRadius:18,backgroundColor:"#ff5a12"},retryText:{color:"#fff",fontWeight:"900"},close:{position:"absolute",right:18,bottom:32,width:46,height:46,borderRadius:23,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",elevation:5},closeText:{fontSize:30,color:"#ff4a14",lineHeight:34}});
