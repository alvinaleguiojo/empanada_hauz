import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { io, Socket } from "socket.io-client";
import RiderTabbedApp from "./RiderTabbedApp";
import RiderMapView from "./RiderMapView";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://empanadahauz.com/api";
const TOKEN_KEY = "empanada-rider-token";
const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

type Coordinate = { latitude: number; longitude: number };
type RiderProfile = { id: string; locations?: Coordinate[] };
type Job = { id: string; status: string; pickupLatitude?: number | null; pickupLongitude?: number | null; dropoffLatitude?: number | null; dropoffLongitude?: number | null; pickupAddress?: string; dropoffAddress?: string };

async function getRider(token: string) { const response = await fetch(`${API_URL}/rider/me`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error("Unable to load rider profile"); return (await response.json()) as RiderProfile; }
async function getJobs(token: string) { const response = await fetch(`${API_URL}/rider/jobs`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error("Unable to load rider deliveries"); return (await response.json()) as Job[]; }

export default function RiderRealtimeApp() {
  const [, setRevision] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapData, setMapData] = useState<{ riderLocation: Coordinate | null; job: Job | null }>({ riderLocation: null, job: null });
  const [liveLocation, setLiveLocation] = useState<Coordinate | null>(null);

  const handleLocation = useCallback((coords: { latitude: number; longitude: number }) => setLiveLocation({ latitude: coords.latitude, longitude: coords.longitude }), []);

  const openMap = async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY); if (!token) return;
    try {
      const [rider, jobs] = await Promise.all([getRider(token), getJobs(token)]);
      const active = jobs.find((job) => ["assigned", "accepted", "pickup_started", "picked_up", "delivering"].includes(job.status)) ?? jobs[0] ?? null;
      const lastLocation = rider.locations?.[0];
      setMapData({ riderLocation: lastLocation ? { latitude: lastLocation.latitude, longitude: lastLocation.longitude } : null, job: active });
      setMapOpen(true);
    } catch { setMapOpen(false); }
  };

  useEffect(() => {
    let socket: Socket | null = null; let connectedToken: string | null = null; let stopped = false; let timer: ReturnType<typeof setInterval> | null = null;
    const disconnect = () => { socket?.disconnect(); socket = null; connectedToken = null; };
    const syncConnection = async () => {
      if (stopped) return;
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) { disconnect(); return; }
      if (socket && connectedToken === token) return;
      disconnect();
      try {
        const rider = await getRider(token); if (stopped) return;
        connectedToken = token;
        socket = io(`${SOCKET_URL}/ops`, { transports: ["websocket", "polling"], auth: { token }, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000, timeout: 10000 });
        socket.on("connect", () => socket?.emit("rider.presence", { riderId: rider.id }));
        const refresh = () => setRevision((value) => value + 1);
        socket.on("rider.delivery.assigned", refresh); socket.on("rider.delivery.updated", refresh); socket.on("rider.status.updated", refresh);
      } catch { disconnect(); }
    };
    void syncConnection(); timer = setInterval(() => void syncConnection(), 2000);
    return () => { stopped = true; if (timer) clearInterval(timer); disconnect(); };
  }, []);

  return <View style={styles.root}>
    <RiderTabbedApp onLocation={handleLocation} />
    <Pressable onPress={() => void openMap()} style={styles.mapButton} accessibilityLabel="Open delivery map"><Text style={styles.mapIcon}>⌖</Text><Text style={styles.mapLabel}>Map</Text></Pressable>
    <Modal visible={mapOpen} animationType="slide" onRequestClose={() => setMapOpen(false)}><View style={styles.modal}><RiderMapView riderLocation={liveLocation ?? mapData.riderLocation} pickup={mapData.job?.pickupLatitude != null && mapData.job?.pickupLongitude != null ? { latitude: mapData.job.pickupLatitude, longitude: mapData.job.pickupLongitude } : null} dropoff={mapData.job?.dropoffLatitude != null && mapData.job?.dropoffLongitude != null ? { latitude: mapData.job.dropoffLatitude, longitude: mapData.job.dropoffLongitude } : null} pickupAddress={mapData.job?.pickupAddress} dropoffAddress={mapData.job?.dropoffAddress} onClose={() => setMapOpen(false)} /></View></Modal>
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1 }, modal: { flex: 1, backgroundColor: "#101521" }, mapButton: { position: "absolute", right: 18, bottom: 92, width: 58, height: 58, borderRadius: 29, backgroundColor: "#ef6637", alignItems: "center", justifyContent: "center", elevation: 8, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, mapIcon: { color: "#fff", fontSize: 22, lineHeight: 23, fontWeight: "800" }, mapLabel: { color: "#fff", fontSize: 10, fontWeight: "800", marginTop: 1 } });
