import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { io, Socket } from "socket.io-client";
import RiderTabbedApp from "./RiderTabbedApp";
import RiderMapView from "./RiderMapView";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://empanadahauz.com/api";
const TOKEN_KEY = "empanada-rider-token";
const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");
const MAX_ACCEPTABLE_ACCURACY_METERS = 50;
const MAX_STORED_LOCATION_AGE_MS = 45_000;
const ACTIVE_STATUSES = ["requested", "searching_rider", "assigned", "accepted", "pickup_started", "picked_up", "delivering"];

type Coordinate = { latitude: number; longitude: number; createdAt?: string };
type RiderProfile = { id: string; status?: string; locations?: Array<Coordinate & { accuracy?: number | null; createdAt?: string }> };
type Job = { id: string; status: string; riderId?: string | null; pickupLatitude?: number | null; pickupLongitude?: number | null; dropoffLatitude?: number | null; dropoffLongitude?: number | null; pickupAddress?: string; dropoffAddress?: string; order?: unknown };

async function getRider(token: string) { const response = await fetch(`${API_URL}/rider/me`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error("Unable to load rider profile"); return (await response.json()) as RiderProfile; }
async function getJobs(token: string) { const response = await fetch(`${API_URL}/rider/jobs`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error("Unable to load rider deliveries"); return (await response.json()) as Job[]; }

function isFreshLocation(location?: Coordinate & { accuracy?: number | null } | null) {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return false;
  if (location.accuracy != null && location.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) return false;
  if (!location.createdAt) return false;
  const age = Date.now() - new Date(location.createdAt).getTime();
  return Number.isFinite(age) && age >= 0 && age <= MAX_STORED_LOCATION_AGE_MS;
}

export default function RiderRealtimeApp() {
  const [mapOpen, setMapOpen] = useState(false);
  const [mapData, setMapData] = useState<{ riderLocation: Coordinate | null; job: Job | null }>({ riderLocation: null, job: null });
  const [liveLocation, setLiveLocation] = useState<Coordinate | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  const applyJobs = useCallback((jobs: Job[]) => {
    const active = jobs.find((job) => ACTIVE_STATUSES.includes(job.status)) ?? null;
    setActiveJob(active);
    setMapData((current) => ({ ...current, job: active }));
  }, []);

  const applyJobEvent = useCallback((job: Job | null | undefined) => {
    if (!job?.id) return;
    setActiveJob((current) => {
      if (job.status === "delivered" || job.status === "cancelled") return current?.id === job.id ? null : current;
      return job;
    });
    setMapData((current) => ({ ...current, job: job.status === "delivered" || job.status === "cancelled" ? (current.job?.id === job.id ? null : current.job) : job }));
  }, []);

  const handleLocation = useCallback((coords: { latitude: number; longitude: number }) => setLiveLocation({ latitude: coords.latitude, longitude: coords.longitude, createdAt: new Date().toISOString() }), []);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let stopped = false;
    const start = async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token || stopped) return;
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted" || stopped) return;
      subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Highest, timeInterval: 5000, distanceInterval: 10 }, async (position) => {
        const { latitude, longitude, accuracy, altitude, heading, speed } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || accuracy == null || accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) return;
        const payload = { latitude, longitude, accuracy, altitude: altitude ?? undefined, heading: heading ?? undefined, speed: speed ?? undefined, timestamp: position.timestamp };
        setLiveLocation({ latitude, longitude, createdAt: new Date(position.timestamp).toISOString() });
        try { await fetch(`${API_URL}/rider/location`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }); } catch { /* next GPS fix retries */ }
      });
    };
    void start();
    return () => { stopped = true; subscription?.remove(); };
  }, []);

  const openMap = async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY); if (!token) return;
    try {
      const [rider, jobs] = await Promise.all([getRider(token), getJobs(token)]);
      applyJobs(jobs);
      const active = jobs.find((job) => ACTIVE_STATUSES.includes(job.status)) ?? null;
      const serverLocation = rider.locations?.[0];
      const freshServerLocation = isFreshLocation(serverLocation) ? serverLocation : null;
      setMapData({ riderLocation: freshServerLocation ? { latitude: freshServerLocation.latitude, longitude: freshServerLocation.longitude, createdAt: freshServerLocation.createdAt } : liveLocation, job: active });
      setMapOpen(true);
    } catch { setMapOpen(false); }
  };

  useEffect(() => {
    let socket: Socket | null = null;
    let connectedToken: string | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const disconnect = () => { socket?.disconnect(); socket = null; connectedToken = null; };
    const hydrate = async (token: string) => { try { applyJobs(await getJobs(token)); } catch { /* socket events remain active; next reconnect hydrates */ } };
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
        socket.on("connect", () => { socket?.emit("rider.presence", { riderId: rider.id }); void hydrate(token); });
        socket.on("rider.delivery.assigned", (job: Job) => applyJobEvent(job));
        socket.on("rider.delivery.updated", (job: Job) => applyJobEvent(job));
        socket.on("delivery-network.jobs.updated", (payload: Job | Job[]) => { if (Array.isArray(payload)) applyJobs(payload); else if (payload?.riderId === rider.id) applyJobEvent(payload); });
        socket.on("rider.status.updated", () => { void hydrate(token); });
        socket.on("connect_error", () => { /* Socket.IO reconnects automatically; hydration runs on connect. */ });
      } catch { disconnect(); }
    };
    void syncConnection();
    timer = setInterval(() => void syncConnection(), 5000);
    return () => { stopped = true; if (timer) clearInterval(timer); disconnect(); };
  }, [applyJobEvent, applyJobs]);

  return <View style={styles.root}>
    <RiderTabbedApp onLocation={handleLocation} />
    <Pressable onPress={() => void openMap()} style={styles.mapButton} accessibilityLabel="Open delivery map"><Text style={styles.mapIcon}>⌖</Text><Text style={styles.mapLabel}>Map</Text></Pressable>
    <Modal visible={mapOpen} animationType="slide" onRequestClose={() => setMapOpen(false)}><View style={styles.modal}><RiderMapView riderLocation={liveLocation ?? mapData.riderLocation} status={activeJob?.status} pickup={mapData.job?.pickupLatitude != null && mapData.job?.pickupLongitude != null ? { latitude: mapData.job.pickupLatitude, longitude: mapData.job.pickupLongitude } : null} dropoff={mapData.job?.dropoffLatitude != null && mapData.job?.dropoffLongitude != null ? { latitude: mapData.job.dropoffLatitude, longitude: mapData.job.dropoffLongitude } : null} pickupAddress={mapData.job?.pickupAddress} dropoffAddress={mapData.job?.dropoffAddress} onClose={() => setMapOpen(false)} /></View></Modal>
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1 }, modal: { flex: 1, backgroundColor: "#101521" }, mapButton: { position: "absolute", right: 18, bottom: 92, width: 58, height: 58, borderRadius: 29, backgroundColor: "#ef6637", alignItems: "center", justifyContent: "center", elevation: 8, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, mapIcon: { color: "#fff", fontSize: 22, lineHeight: 23, fontWeight: "800" }, mapLabel: { color: "#fff", fontSize: 10, fontWeight: "800", marginTop: 1 } });
