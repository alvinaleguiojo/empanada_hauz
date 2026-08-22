import { useEffect, useMemo, useRef, useState } from "react";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

const ROUTES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_ROUTES_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const REROUTE_DISTANCE_METERS = 80;
const ARRIVAL_DISTANCE_METERS = 45;
const FOLLOW_DELTA = 0.012;

type Coordinate = { latitude: number; longitude: number };
type Props = { riderLocation?: Coordinate | null; status?: string; pickup?: Coordinate | null; dropoff?: Coordinate | null; pickupAddress?: string; dropoffAddress?: string; onClose?: () => void; simulateNavigation?: boolean };
type NavigationStep = { instruction: string; distanceMeters: number; endLocation: Coordinate; maneuver?: string };
type RouteInfo = { points: Coordinate[]; distance: number; duration: string; steps: NavigationStep[] };
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
function distanceMeters(a: Coordinate, b: Coordinate) { return distanceKm(a, b) * 1000; }
function formatDistance(meters: number) { return meters < 1000 ? `${Math.max(1, Math.round(meters))} m` : `${(meters / 1000).toFixed(1)} km`; }
function maneuverLabel(maneuver?: string) { const value = String(maneuver ?? ""); if (value.includes("LEFT")) return "Turn left"; if (value.includes("RIGHT")) return "Turn right"; if (value.includes("UTURN")) return "Make a U-turn"; if (value.includes("ROUNDABOUT")) return "Enter roundabout"; if (value.includes("MERGE")) return "Merge"; if (value.includes("RAMP")) return "Take the ramp"; if (value.includes("FORK")) return "Keep at the fork"; return "Continue"; }

async function getRoute(origin: Coordinate, destination: Coordinate): Promise<RouteInfo> {
  if (!ROUTES_API_KEY) throw new Error("Google Routes API key is not configured.");
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": ROUTES_API_KEY, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration,routes.legs.steps.distanceMeters,routes.legs.steps.endLocation,routes.legs.steps.navigationInstruction" },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
      destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      languageCode: "en",
      units: "METRIC",
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.routes?.[0]) throw new Error(data.error?.message || "Unable to calculate route.");
  const route = data.routes[0]; const distance = Number(route.distanceMeters ?? 0) / 1000; const duration = String(route.duration ?? "").replace(/s$/, "s"); const points = decodePolyline(String(route.polyline?.encodedPolyline ?? ""));
  const steps: NavigationStep[] = (route.legs ?? []).flatMap((leg: any) => (leg.steps ?? []).map((step: any) => ({
    instruction: String(step.navigationInstruction?.instructions ?? "Continue"),
    distanceMeters: Number(step.distanceMeters ?? 0),
    endLocation: { latitude: Number(step.endLocation?.latLng?.latitude), longitude: Number(step.endLocation?.latLng?.longitude) },
    maneuver: step.navigationInstruction?.maneuver,
  }))).filter((step: NavigationStep) => valid(step.endLocation));
  if (points.length < 2) throw new Error("Google returned an empty route.");
  const durationText = duration ? `${Math.max(1, Math.round(parseFloat(duration) / 60))} min` : "ETA unavailable";
  return { points, distance, duration: durationText, steps };
}

export default function RiderMapView({ riderLocation, status, pickup, dropoff, pickupAddress, dropoffAddress, onClose, simulateNavigation = false }: Props) {
  const map = useRef<MapView>(null); const [path, setPath] = useState<Coordinate[]>([]); const [info, setInfo] = useState<RouteInfo | null>(null); const [loading, setLoading] = useState(false); const [following, setFollowing] = useState(true); const [navigationActive, setNavigationActive] = useState(false); const [routeError, setRouteError] = useState<string | null>(null); const [mapError, setMapError] = useState(false); const [simulatedLocation, setSimulatedLocation] = useState<Coordinate | null>(null); const [stepIndex, setStepIndex] = useState(0); const [arrived, setArrived] = useState(false);
  const lastRouteOrigin = useRef<Coordinate | null>(null); const lastRouteDestination = useRef<Coordinate | null>(null); const lastRerouteAt = useRef(0);
  const goingToDropoff = ["picked_up", "delivering"].includes(status ?? ""); const origin = valid(riderLocation) ? riderLocation : null; const displayRiderLocation = simulateNavigation && valid(simulatedLocation) ? simulatedLocation : riderLocation; const destination = goingToDropoff ? (valid(dropoff) ? dropoff : null) : (valid(pickup) ? pickup : valid(dropoff) ? dropoff : null); const mapPoints = useMemo(() => [riderLocation, pickup, dropoff].filter(valid), [riderLocation, pickup, dropoff]); const activeAddress = goingToDropoff ? dropoffAddress : pickupAddress; const activeLabel = goingToDropoff ? "Drop-off" : valid(pickup) ? "Pickup" : "Delivery"; const currentStep = info?.steps?.[stepIndex] ?? null;
  const fitRoute = () => { if (mapPoints.length) map.current?.fitToCoordinates(mapPoints, { edgePadding: { top: 180, right: 50, bottom: navigationActive ? 360 : 290, left: 50 }, animated: true }); };
  const centerOnRider = () => { if (!valid(displayRiderLocation)) return; setFollowing(true); map.current?.animateToRegion({ latitude: displayRiderLocation.latitude, longitude: displayRiderLocation.longitude, latitudeDelta: FOLLOW_DELTA, longitudeDelta: FOLLOW_DELTA }, 450); };
  useEffect(() => { requestAnimationFrame(fitRoute); }, [riderLocation?.latitude, riderLocation?.longitude, pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude, status, navigationActive]);
  useEffect(() => {
    if (!destination) { setPath([]); setInfo(null); setRouteError("Waiting for destination coordinates."); lastRouteOrigin.current = null; lastRouteDestination.current = null; return; }
    if (!ROUTES_API_KEY) { setPath([]); setInfo(null); setRouteError("Google Routes API key is not configured. The map and markers can still load."); return; }
    if (origin && lastRouteOrigin.current && lastRouteDestination.current && Math.abs(lastRouteDestination.current.latitude - destination.latitude) < 0.00001 && Math.abs(lastRouteDestination.current.longitude - destination.longitude) < 0.00001 && distanceMeters(lastRouteOrigin.current, origin) < REROUTE_DISTANCE_METERS && path.length > 1) return;
    if (Date.now() - lastRerouteAt.current < 1500) return; lastRerouteAt.current = Date.now(); let cancelled = false; setLoading(true); setRouteError(null);
    const loadRoute = async () => { try { if (!origin) throw new Error("RIDER_LOCATION_MISSING"); const result = await getRoute(origin, destination); if (!cancelled) { setPath(result.points); setInfo(result); setStepIndex(0); setArrived(false); lastRouteOrigin.current = origin; lastRouteDestination.current = destination; } } catch (error) { if (!cancelled) { setPath([]); setInfo(null); setRouteError(error instanceof Error ? error.message : "Unable to calculate route."); } } finally { if (!cancelled) setLoading(false); } };
    void loadRoute(); return () => { cancelled = true; };
  }, [riderLocation?.latitude, riderLocation?.longitude, destination?.latitude, destination?.longitude, status, goingToDropoff, path.length]);
  useEffect(() => { if (!navigationActive || !valid(displayRiderLocation) || !info?.steps?.length) return; let next = stepIndex; while (next < info.steps.length - 1 && distanceMeters(displayRiderLocation, info.steps[next].endLocation) <= ARRIVAL_DISTANCE_METERS) next += 1; if (next !== stepIndex) setStepIndex(next); if (valid(destination) && distanceMeters(displayRiderLocation, destination) <= ARRIVAL_DISTANCE_METERS) { setArrived(true); setFollowing(false); } }, [displayRiderLocation?.latitude, displayRiderLocation?.longitude, navigationActive, stepIndex, info?.steps?.length, destination?.latitude, destination?.longitude]);
  useEffect(() => { if (following && valid(displayRiderLocation)) centerOnRider(); }, [following, displayRiderLocation?.latitude, displayRiderLocation?.longitude]);
  useEffect(() => { if (!simulateNavigation || path.length < 2 || !destination) { setSimulatedLocation(null); return; } const startedAt = Date.now(); const routeKm = info?.distance ?? path.slice(0, -1).reduce((sum, point, index) => sum + distanceKm(point, path[index + 1]), 0); const durationMs = Math.min(90000, Math.max(30000, routeKm * 1000 / 4 * 1000)); setNavigationActive(true); setFollowing(true); const timer = setInterval(() => { const progress = Math.min(1, (Date.now() - startedAt) / durationMs); const target = routeKm * progress; let travelled = 0; let next = path[path.length - 1]; for (let i = 0; i < path.length - 1; i += 1) { const segment = distanceKm(path[i], path[i + 1]); if (travelled + segment >= target) { const ratio = segment ? (target - travelled) / segment : 0; next = { latitude: path[i].latitude + (path[i + 1].latitude - path[i].latitude) * ratio, longitude: path[i].longitude + (path[i + 1].longitude - path[i].longitude) * ratio }; break; } travelled += segment; } setSimulatedLocation(next); if (progress >= 1) clearInterval(timer); }, 700); return () => clearInterval(timer); }, [simulateNavigation, path, destination?.latitude, destination?.longitude, info?.distance]);
  return <View style={s.container}>
    <MapView ref={map} style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE} mapType="standard" initialRegion={initialRegion(mapPoints)} showsUserLocation={false} showsMyLocationButton={false} onMapReady={() => { setMapError(false); requestAnimationFrame(fitRoute); }} onMapLoaded={() => setMapError(false)} onError={() => setMapError(true)} onPanDrag={() => setFollowing(false)}>
      {valid(displayRiderLocation) ? <Marker coordinate={displayRiderLocation} title="You"><View style={s.riderDot}><View style={s.riderArrow} /></View></Marker> : null}
      {valid(pickup) ? <Marker coordinate={pickup} title="Pickup" description={pickupAddress}><View style={s.pick}><Text style={s.markerText}>▣</Text></View></Marker> : null}
      {valid(dropoff) ? <Marker coordinate={dropoff} title="Drop-off" description={dropoffAddress}><View style={s.drop}><Text style={s.markerText}>⌂</Text></View></Marker> : null}
      {path.length > 1 ? <Polyline coordinates={path} strokeColor="#ff4a14" strokeWidth={navigationActive ? 8 : 7} lineCap="round" lineJoin="round" /> : null}
    </MapView>
    {mapError ? <View style={s.mapError}><Text style={s.mapErrorTitle}>Map could not be loaded</Text><Text style={s.mapErrorText}>Check the Google Maps SDK key, Maps SDK for Android/iOS, and app package restriction.</Text><Pressable onPress={() => { setMapError(false); requestAnimationFrame(fitRoute); }} style={s.retry}><Text style={s.retryText}>Retry</Text></Pressable></View> : null}
    <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onClose} style={s.back}><Text style={s.backText}>‹</Text></Pressable><Image source={require("../web/public/empanada hauz logo.jpg")} style={s.logo} resizeMode="contain" /><View style={s.online}><View style={s.green} /><Text style={s.onlineText}>Online</Text></View></View>
    <View style={s.side}>{valid(displayRiderLocation) ? <Pressable style={s.round} onPress={centerOnRider}><Text style={s.roundText}>⌖</Text></Pressable> : null}<Pressable style={s.round} onPress={fitRoute}><Text style={s.roundText}>◎</Text></Pressable></View>
    {navigationActive && currentStep && !arrived ? <View style={s.turnCard}><View style={s.turnIcon}><Text style={s.turnIconText}>➜</Text></View><View style={s.turnBody}><Text style={s.turnLabel}>{maneuverLabel(currentStep.maneuver)}</Text><Text style={s.turnInstruction} numberOfLines={2}>{currentStep.instruction}</Text></View><Text style={s.turnDistance}>{formatDistance(currentStep.distanceMeters)}</Text></View> : null}
    <View style={s.bottomCard}><View style={s.routeHeader}><View style={{ flex: 1 }}><Text style={s.navTitle}>{navigationActive ? `Navigating to ${activeLabel}` : `Route to ${activeLabel}`}</Text><Text style={s.navSub}>{info ? `${info.duration} • ${info.distance.toFixed(1)} km` : loading ? "Calculating road route…" : "Route unavailable"}</Text></View>{navigationActive ? <View style={s.livePill}><Text style={s.livePillText}>LIVE</Text></View> : null}</View><Text style={s.address} numberOfLines={2}>{activeAddress ?? "Location pending"}</Text>{arrived ? <View style={s.arrivalBanner}><Text style={s.arrivalText}>Arrived at {activeLabel}</Text></View> : null}<View style={s.buttonRow}><Pressable style={[s.primaryButton, !valid(origin) && s.disabledButton]} disabled={!valid(origin)} onPress={() => { setNavigationActive(true); setFollowing(true); setArrived(false); centerOnRider(); }}><Text style={s.primaryButtonText}>{navigationActive ? "Following Route" : "Start Navigation"}</Text></Pressable><Pressable style={s.secondaryButton} onPress={centerOnRider}><Text style={s.secondaryButtonText}>Recenter</Text></Pressable></View></View>
    {loading ? <View style={s.loading}><ActivityIndicator color="#ff4a14" /></View> : null}{routeError ? <View style={s.notice}><Text style={s.noticeText}>{routeError}</Text></View> : null}
  </View>;
}
const s = StyleSheet.create({container:{flex:1,backgroundColor:"#ece7dc"},header:{position:"absolute",top:0,left:0,right:0,height:104,backgroundColor:"#ff5a12",borderBottomLeftRadius:32,borderBottomRightRadius:32,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:18,paddingTop:24,elevation:8},back:{width:44,height:44,borderRadius:22,backgroundColor:"rgba(0,0,0,0.16)",alignItems:"center",justifyContent:"center"},backText:{color:"#fff",fontSize:34,lineHeight:34},logo:{width:110,height:42},online:{flexDirection:"row",alignItems:"center",gap:7},green:{width:8,height:8,borderRadius:4,backgroundColor:"#8ff06e"},onlineText:{color:"#fff",fontWeight:"800",fontSize:12},side:{position:"absolute",right:16,top:128,gap:10},round:{width:48,height:48,borderRadius:24,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",elevation:5},roundText:{fontSize:22,fontWeight:"800",color:"#243041"},riderDot:{width:30,height:30,borderRadius:15,backgroundColor:"#fff",borderWidth:3,borderColor:"#ff5a12",alignItems:"center",justifyContent:"center",elevation:3},riderArrow:{width:0,height:0,borderLeftWidth:7,borderRightWidth:7,borderBottomWidth:14,borderLeftColor:"transparent",borderRightColor:"transparent",borderBottomColor:"#ff5a12"},pick:{width:36,height:36,borderRadius:18,backgroundColor:"#1f7a42",alignItems:"center",justifyContent:"center",borderWidth:3,borderColor:"#fff"},drop:{width:36,height:36,borderRadius:18,backgroundColor:"#c83f3f",alignItems:"center",justifyContent:"center",borderWidth:3,borderColor:"#fff"},markerText:{color:"#fff",fontSize:16,fontWeight:"900"},turnCard:{position:"absolute",top:118,left:16,right:78,minHeight:86,borderRadius:18,backgroundColor:"#fff",padding:14,flexDirection:"row",alignItems:"center",gap:12,elevation:8},turnIcon:{width:52,height:52,borderRadius:14,backgroundColor:"#ff5a12",alignItems:"center",justifyContent:"center"},turnIconText:{color:"#fff",fontSize:28,fontWeight:"900"},turnBody:{flex:1},turnLabel:{fontSize:14,fontWeight:"900",color:"#243041",textTransform:"uppercase"},turnInstruction:{fontSize:13,fontWeight:"600",color:"#5c6778",marginTop:2},turnDistance:{fontSize:16,fontWeight:"900",color:"#ff5a12"},bottomCard:{position:"absolute",left:14,right:14,bottom:18,borderRadius:24,backgroundColor:"#fff",padding:18,elevation:10},routeHeader:{flexDirection:"row",alignItems:"center",gap:10},navTitle:{fontSize:18,fontWeight:"900",color:"#1f2937"},navSub:{fontSize:13,fontWeight:"700",color:"#677386",marginTop:3},livePill:{paddingHorizontal:9,paddingVertical:5,borderRadius:10,backgroundColor:"#e8f8ed"},livePillText:{fontSize:10,fontWeight:"900",color:"#1f7a42"},address:{fontSize:14,fontWeight:"600",color:"#4f5b6b",marginTop:10},arrivalBanner:{marginTop:10,borderRadius:12,backgroundColor:"#e8f8ed",padding:10},arrivalText:{textAlign:"center",fontSize:13,fontWeight:"900",color:"#1f7a42"},buttonRow:{flexDirection:"row",gap:10,marginTop:14},primaryButton:{flex:1,borderRadius:14,backgroundColor:"#ff5a12",paddingVertical:14,alignItems:"center"},primaryButtonText:{color:"#fff",fontWeight:"900",fontSize:14},secondaryButton:{paddingHorizontal:16,borderRadius:14,borderWidth:1,borderColor:"#d8dee8",alignItems:"center",justifyContent:"center"},secondaryButtonText:{color:"#243041",fontWeight:"800",fontSize:14},disabledButton:{opacity:.45},loading:{position:"absolute",top:116,right:18,width:38,height:38,borderRadius:19,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",elevation:5},notice:{position:"absolute",left:16,right:16,bottom:170,borderRadius:12,backgroundColor:"#fff4e8",padding:10,elevation:5},noticeText:{color:"#7b4b11",fontSize:12,fontWeight:"700",textAlign:"center"},mapError:{position:"absolute",left:20,right:20,top:"40%",borderRadius:18,backgroundColor:"#fff",padding:20,elevation:8},mapErrorTitle:{fontSize:18,fontWeight:"900",color:"#202836"},mapErrorText:{fontSize:13,lineHeight:18,color:"#5f6b7b",marginTop:7},retry:{marginTop:12,backgroundColor:"#ff5a12",borderRadius:12,padding:12,alignItems:"center"},retryText:{color:"#fff",fontWeight:"900"}});
