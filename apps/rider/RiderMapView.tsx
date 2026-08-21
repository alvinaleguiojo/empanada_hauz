import { useEffect, useMemo, useRef, useState } from "react";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

const DIRECTIONS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
type Coordinate = { latitude: number; longitude: number };
type Props = { riderLocation?: Coordinate | null; status?: string; pickup?: Coordinate | null; dropoff?: Coordinate | null; pickupAddress?: string; dropoffAddress?: string; onClose?: () => void };
type RouteInfo = { points: Coordinate[]; distance: number; duration: string };
const valid = (p?: Coordinate | null): p is Coordinate => !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);

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
async function getRoute(origin: Coordinate, destination: Coordinate): Promise<RouteInfo> {
  if (!DIRECTIONS_API_KEY) throw new Error("Google Maps API key is missing.");
  const params = new URLSearchParams({ origin: `${origin.latitude},${origin.longitude}`, destination: `${destination.latitude},${destination.longitude}`, mode: "driving", key: DIRECTIONS_API_KEY });
  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`); const data = await response.json();
  if (!response.ok || data.status !== "OK" || !data.routes?.[0]) { if (data.status === "REQUEST_DENIED") throw new Error(data.error_message || "Directions API request was denied."); if (data.status === "ZERO_RESULTS") throw new Error("No driving route was found between these locations."); throw new Error(data.error_message || data.status || "Unable to calculate route."); }
  const route = data.routes[0]; const legs = route.legs ?? []; const distance = legs.reduce((sum: number, leg: any) => sum + Number(leg.distance?.value ?? 0), 0) / 1000; const duration = legs.map((leg: any) => leg.duration?.text).filter(Boolean).join(" • "); const points = decodePolyline(route.overview_polyline?.points ?? "");
  if (points.length < 2) throw new Error("Google returned an empty route."); return { points, distance, duration };
}

export default function RiderMapView({ riderLocation, status, pickup, dropoff, pickupAddress, dropoffAddress, onClose }: Props) {
  const map = useRef<MapView>(null); const [path, setPath] = useState<Coordinate[]>([]); const [info, setInfo] = useState<RouteInfo | null>(null); const [loading, setLoading] = useState(false); const [following, setFollowing] = useState(false); const [routeError, setRouteError] = useState<string | null>(null);
  const goingToDropoff = ["picked_up", "delivering"].includes(status ?? "");
  const origin = valid(riderLocation) ? riderLocation : null;
  const destination = goingToDropoff ? (valid(dropoff) ? dropoff : null) : (valid(pickup) ? pickup : valid(dropoff) ? dropoff : null);
  const mapPoints = useMemo(() => [riderLocation, pickup, dropoff].filter(valid), [riderLocation, pickup, dropoff]);
  const activeAddress = goingToDropoff ? dropoffAddress : pickupAddress;
  const activeLabel = goingToDropoff ? "Drop-off" : valid(pickup) ? "Pickup" : "Delivery";

  const fitRoute = () => { if (mapPoints.length) map.current?.fitToCoordinates(mapPoints, { edgePadding: { top: 180, right: 50, bottom: 290, left: 50 }, animated: true }); };
  useEffect(() => { requestAnimationFrame(fitRoute); }, [riderLocation?.latitude, riderLocation?.longitude, pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude, status]);
  useEffect(() => {
    if (!origin || !destination) { setPath([]); setInfo(null); setRouteError("Waiting for rider and destination coordinates."); return; }
    let cancelled = false; setLoading(true); setRouteError(null);
    getRoute(origin, destination).then(result => { if (!cancelled) { setPath(result.points); setInfo(result); } }).catch(error => { if (!cancelled) { setPath([]); setInfo(null); setRouteError(error instanceof Error ? error.message : "Unable to calculate route."); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [riderLocation?.latitude, riderLocation?.longitude, destination?.latitude, destination?.longitude, status]);
  useEffect(() => { if (following && valid(riderLocation)) map.current?.animateToRegion({ latitude: riderLocation.latitude, longitude: riderLocation.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 450); }, [following, riderLocation?.latitude, riderLocation?.longitude]);

  return <View style={s.container}>
    <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={initialRegion(mapPoints)} showsUserLocation={false} showsMyLocationButton={false} onPanDrag={() => setFollowing(false)}>
      {valid(riderLocation) ? <Marker coordinate={riderLocation} title="You"><View style={s.riderDot} /></Marker> : null}
      {valid(pickup) ? <Marker coordinate={pickup} title="Pickup" description={pickupAddress}><View style={s.pick}><Text style={s.markerText}>▣</Text></View></Marker> : null}
      {valid(dropoff) ? <Marker coordinate={dropoff} title="Drop-off" description={dropoffAddress}><View style={s.drop}><Text style={s.markerText}>⌂</Text></View></Marker> : null}
      {path.length > 1 ? <Polyline coordinates={path} strokeColor="#ff4a14" strokeWidth={6} /> : null}
    </MapView>
    <View style={s.header}><View style={s.menu}><Text style={s.menuText}>☰</Text></View><Image source={require("../web/public/empanada hauz logo.jpg")} style={s.logo} resizeMode="contain" /><View style={s.online}><View style={s.green} /><Text style={s.onlineText}>Online</Text></View></View>
    <View style={s.side}>{valid(riderLocation) ? <Pressable style={s.round} onPress={() => { setFollowing(true); if (valid(riderLocation)) map.current?.animateToRegion({ latitude: riderLocation.latitude, longitude: riderLocation.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 450); }}><Text style={s.roundText}>⌖</Text></Pressable> : null}<Pressable style={s.round} onPress={fitRoute}><Text style={s.roundText}>◎</Text></Pressable></View>
    <View style={s.current}><View style={s.orderNum}><Text style={s.orderNumText}>1</Text></View><View style={{ flex: 1 }}><View style={s.row}><Text style={s.currentTitle}>Current Order</Text><View style={s.pickPill}><Text style={s.pickPillText}>{activeLabel}</Text></View></View><Text style={s.address} numberOfLines={1}>{activeAddress ?? "Location pending"}</Text><Text style={s.sub}>{loading ? "Calculating road route…" : info ? `${info.distance.toFixed(1)} km • ${info.duration}` : routeError ?? "Route unavailable"}</Text></View></View>
    {loading ? <View style={s.loading}><ActivityIndicator color="#ff4a14" /></View> : null}{routeError ? <View style={s.notice}><Text style={s.noticeText}>{routeError}</Text></View> : null}{onClose ? <Pressable onPress={onClose} style={s.close}><Text style={s.closeText}>×</Text></Pressable> : null}
  </View>;
}
const s = StyleSheet.create({container:{flex:1,backgroundColor:"#ece7dc"},header:{position:"absolute",top:0,left:0,right:0,height:104,backgroundColor:"#ff5a12",borderBottomLeftRadius:32,borderBottomRightRadius:32,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:22,paddingTop:24,elevation:8},menu:{width:42},menuText:{fontSize:30,color:"#fff",fontWeight:"500"},logo:{width:150,height:70,marginTop:2},online:{backgroundColor:"#fff",borderRadius:20,paddingHorizontal:12,paddingVertical:8,flexDirection:"row",alignItems:"center",gap:7},green:{width:10,height:10,borderRadius:5,backgroundColor:"#16a34a"},onlineText:{fontWeight:"800",color:"#252525",fontSize:13},side:{position:"absolute",right:20,top:220,gap:14},round:{width:58,height:58,borderRadius:29,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",elevation:5},roundText:{fontSize:28,color:"#ff4a14",fontWeight:"800"},current:{position:"absolute",top:128,left:18,right:18,backgroundColor:"rgba(255,255,255,.97)",borderRadius:22,padding:16,flexDirection:"row",gap:12,elevation:6},orderNum:{width:42,height:42,borderRadius:14,backgroundColor:"#ff4a14",alignItems:"center",justifyContent:"center"},orderNumText:{color:"#fff",fontSize:21,fontWeight:"900"},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},currentTitle:{color:"#df4618",fontSize:17,fontWeight:"900"},pickPill:{backgroundColor:"#262626",borderRadius:16,paddingHorizontal:10,paddingVertical:5},pickPillText:{color:"#fff",fontWeight:"800",fontSize:11},address:{color:"#252525",fontSize:15,fontWeight:"800",marginTop:4},sub:{color:"#777",fontSize:12,marginTop:4},riderDot:{width:24,height:24,borderRadius:12,backgroundColor:"#ff4a14",borderWidth:5,borderColor:"#fff"},pick:{width:50,height:50,borderRadius:25,backgroundColor:"#ff5a12",borderWidth:3,borderColor:"#fff",alignItems:"center",justifyContent:"center"},drop:{width:50,height:50,borderRadius:25,backgroundColor:"#ef3f23",borderWidth:3,borderColor:"#fff",alignItems:"center",justifyContent:"center"},markerText:{color:"#fff",fontSize:22,fontWeight:"900"},notice:{position:"absolute",left:20,right:70,bottom:26,backgroundColor:"rgba(255,255,255,.95)",borderRadius:14,paddingHorizontal:12,paddingVertical:8},noticeText:{color:"#8b5b3e",fontSize:11,fontWeight:"800"},loading:{position:"absolute",top:245,right:22,width:42,height:42,borderRadius:21,backgroundColor:"white",alignItems:"center",justifyContent:"center",elevation:5},close:{position:"absolute",right:18,bottom:32,width:46,height:46,borderRadius:23,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",elevation:5},closeText:{fontSize:30,color:"#ff4a14",lineHeight:34}});