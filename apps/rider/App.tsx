import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://empanadahauz.com/api";
const TOKEN_KEY = "empanada-rider-token";

type RiderStatus = "offline" | "online" | "busy" | "suspended";
type JobStatus = "requested" | "searching_rider" | "assigned" | "accepted" | "pickup_started" | "picked_up" | "delivering" | "delivered" | "cancelled";

type AuthUser = { id: string; name: string; email: string; role: string };
type Rider = {
  id: string;
  phoneNumber?: string | null;
  status: RiderStatus;
  serviceArea?: string | null;
  rating: number;
  completedJobs: number;
  user: AuthUser;
  vehicles: Array<{ type: string; plateNumber?: string | null; model?: string | null; color?: string | null }>;
  locations: Array<{ latitude: number; longitude: number; createdAt: string }>;
};
type DeliveryJob = {
  id: string;
  status: JobStatus;
  pickupAddress: string;
  pickupLatitude?: number | null;
  pickupLongitude?: number | null;
  dropoffAddress: string;
  dropoffLatitude?: number | null;
  dropoffLongitude?: number | null;
  distanceKm?: number | null;
  estimatedDurationMinutes?: number | null;
  estimatedArrivalAt?: string | null;
  estimatedFare: number;
  finalFare?: number | null;
  notes?: string | null;
  requestedAt: string;
  order?: {
    orderNumber: string;
    totalAmount: number;
    quantity: number;
    customer: { name: string; phoneNumber?: string | null };
  } | null;
};
type Session = { accessToken: string; user: AuthUser };

const activeStatuses: JobStatus[] = ["assigned", "accepted", "pickup_started", "picked_up", "delivering"];
const completedStatuses: JobStatus[] = ["delivered", "cancelled"];
const nextStatusByCurrent: Partial<Record<JobStatus, JobStatus>> = {
  assigned: "accepted",
  accepted: "pickup_started",
  pickup_started: "picked_up",
  picked_up: "delivering",
  delivering: "delivered"
};

function RiderApp() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [rider, setRider] = useState<Rider | null>(null);
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<DeliveryJob | null>(null);

  const activeJobs = useMemo(() => jobs.filter((job) => activeStatuses.includes(job.status)), [jobs]);
  const historyJobs = useMemo(() => jobs.filter((job) => completedStatuses.includes(job.status)).slice(0, 8), [jobs]);
  const todaysDelivered = useMemo(() => jobs.filter((job) => job.status === "delivered" && isToday(job.requestedAt)), [jobs]);
  const todaysFare = todaysDelivered.reduce((sum, job) => sum + Number(job.finalFare ?? job.estimatedFare ?? 0), 0);

  const loadRider = useCallback(async (nextToken = token) => {
    if (!nextToken) return;
    const [profile, riderJobs] = await Promise.all([
      apiFetch<Rider>("/rider/me", nextToken),
      apiFetch<DeliveryJob[]>("/rider/jobs", nextToken)
    ]);
    setRider(profile);
    setJobs(riderJobs);
  }, [token]);

  useEffect(() => { void restoreSession(); }, []);

  async function restoreSession() {
    try {
      const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (storedToken) {
        setToken(storedToken);
        await loadRider(storedToken);
      }
    } catch {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setToken(null);
    } finally {
      setBooting(false);
    }
  }

  async function login() {
    if (!email.trim() || password.length < 8) {
      setError("Enter your rider email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await apiFetch<Session>("/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      if (session.user.role !== "rider") throw new Error("This account is not a rider account.");
      await SecureStore.setItemAsync(TOKEN_KEY, session.accessToken);
      setToken(session.accessToken);
      await loadRider(session.accessToken);
      setPassword("");
    } catch (err) {
      setError(getErrorMessage(err, "Login failed."));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setRider(null);
    setJobs([]);
    setSelectedJob(null);
    setError(null);
  }

  async function refresh() {
    if (!token) return;
    setRefreshing(true);
    setError(null);
    try { await loadRider(token); } catch (err) { setError(getErrorMessage(err, "Unable to refresh rider jobs.")); }
    finally { setRefreshing(false); }
  }

  async function updateAvailability(status: RiderStatus) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      setRider(await apiFetch<Rider>("/rider/status", token, { method: "PATCH", body: JSON.stringify({ status }) }));
    } catch (err) { setError(getErrorMessage(err, "Unable to update availability.")); }
    finally { setBusy(false); }
  }

  async function sendLocation() {
    if (!token) return;
    setBusy(true);
    setError(null);
    setLocationMessage(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") throw new Error("Location permission is required for rider check-ins.");
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await apiFetch("/rider/location", token, {
        method: "POST",
        body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude, heading: position.coords.heading ?? undefined, speed: position.coords.speed ?? undefined })
      });
      setLocationMessage(`GPS updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
      await loadRider(token);
    } catch (err) { setError(getErrorMessage(err, "Unable to update GPS.")); }
    finally { setBusy(false); }
  }

  async function updateJobStatus(job: DeliveryJob, status: JobStatus) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<DeliveryJob>(`/rider/jobs/${job.id}/status`, token, { method: "PATCH", body: JSON.stringify({ status }) });
      setJobs((current) => current.map((item) => item.id === job.id ? updated : item));
      setSelectedJob((current) => current?.id === job.id ? updated : current);
      await loadRider(token);
    } catch (err) { setError(getErrorMessage(err, "Unable to update delivery.")); }
    finally { setBusy(false); }
  }

  if (booting) return <SafeAreaView style={styles.safeArea}><StatusBar style="light" /><View style={styles.centered}><ActivityIndicator color="#ef6637" /><Text style={styles.mutedText}>Loading rider app</Text></View></SafeAreaView>;

  if (!token || !rider) {
    return <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.loginScreen} keyboardShouldPersistTaps="handled">
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>EH</Text></View>
        <Text style={styles.loginTitle}>Empanada Hauz Rider</Text>
        <Text style={styles.loginSubtitle}>Sign in with the rider account created by dispatch.</Text>
        <View style={styles.panel}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="Email" placeholderTextColor="#8390a6" value={email} onChangeText={setEmail} style={styles.input} />
          <TextInput autoCapitalize="none" placeholder="Password" placeholderTextColor="#8390a6" secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />
          <ActionButton label={busy ? "Signing in..." : "Sign In"} onPress={login} disabled={busy} />
        </View>
      </ScrollView>
    </SafeAreaView>;
  }

  const vehicle = rider.vehicles[0];
  const lastLocation = rider.locations[0];

  return <SafeAreaView style={styles.safeArea}>
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={styles.screen} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#ef6637" />}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>Rider App</Text><Text style={styles.title}>{rider.user.name}</Text><Text style={styles.subtle}>{vehicle ? `${capitalize(vehicle.type)} ${vehicle.plateNumber ?? ""}`.trim() : "No active vehicle"}</Text></View>
        <Pressable onPress={logout} style={styles.smallButton}><Text style={styles.smallButtonText}>Logout</Text></Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.summaryGrid}>
        <Metric label="Status" value={formatStatus(rider.status)} tone={rider.status === "online" ? "green" : rider.status === "busy" ? "orange" : "muted"} />
        <Metric label="Active" value={String(activeJobs.length)} />
        <Metric label="Today" value={`Php ${todaysFare.toFixed(0)}`} />
      </View>
      <View style={styles.panel}>
        <View style={styles.rowBetween}><View><Text style={styles.sectionTitle}>Availability</Text><Text style={styles.subtle}>{rider.serviceArea ?? "All service areas"}</Text></View><AvailabilityPill status={rider.status} /></View>
        <View style={styles.buttonRow}><ActionButton label="Go Online" onPress={() => updateAvailability("online")} disabled={busy || rider.status === "online"} compact /><ActionButton label="Go Offline" onPress={() => updateAvailability("offline")} disabled={busy || rider.status === "offline"} compact variant="secondary" /></View>
        <ActionButton label={busy ? "Updating GPS..." : "Send GPS Check-In"} onPress={sendLocation} disabled={busy} variant="dark" />
        <Text style={styles.subtle}>{locationMessage ?? (lastLocation ? `Last GPS ${Number(lastLocation.latitude).toFixed(5)}, ${Number(lastLocation.longitude).toFixed(5)}` : "No GPS check-in yet")}</Text>
      </View>
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Assigned Deliveries</Text><Text style={styles.subtle}>{activeJobs.length} open</Text></View>
      {activeJobs.length === 0 ? <View style={styles.emptyState}><Text style={styles.emptyTitle}>No active delivery</Text><Text style={styles.subtle}>Go online and wait for dispatch to assign your next job.</Text></View> : null}
      {activeJobs.map((job) => <JobCard key={job.id} job={job} busy={busy} onUpdateStatus={updateJobStatus} onShowDetails={setSelectedJob} />)}
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Recent Activity</Text><Text style={styles.subtle}>{rider.completedJobs} completed total</Text></View>
      {historyJobs.length === 0 ? <View style={styles.emptyState}><Text style={styles.emptyTitle}>No completed jobs yet</Text><Text style={styles.subtle}>Delivered and cancelled jobs will appear here.</Text></View> : null}
      {historyJobs.map((job) => <View key={job.id} style={styles.historyItem}><View style={styles.historyDot} /><View style={styles.historyBody}><Text style={styles.historyTitle}>{job.order?.orderNumber ?? shortId(job.id)}</Text><Text style={styles.subtle}>{job.order?.customer.name ?? job.dropoffAddress}</Text></View><Text style={styles.historyFare}>Php {Number(job.finalFare ?? job.estimatedFare ?? 0).toFixed(0)}</Text></View>)}
    </ScrollView>
    <OrderDetailsModal job={selectedJob} visible={Boolean(selectedJob)} onClose={() => setSelectedJob(null)} busy={busy} onUpdateStatus={updateJobStatus} />
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><RiderApp /></SafeAreaProvider>; }

function JobCard({ job, busy, onUpdateStatus, onShowDetails }: { job: DeliveryJob; busy: boolean; onUpdateStatus: (job: DeliveryJob, status: JobStatus) => void; onShowDetails: (job: DeliveryJob) => void }) {
  const nextStatus = nextStatusByCurrent[job.status];
  const customer = job.order?.customer;
  const phone = customer?.phoneNumber;
  return <View style={styles.jobCard}>
    <Pressable onPress={() => onShowDetails(job)} style={({ pressed }) => [styles.jobHeaderPressable, pressed && styles.pressedButton]}>
      <View style={styles.jobTitleBlock}><Text style={styles.jobNumber}>{job.order?.orderNumber ?? shortId(job.id)}</Text><Text style={styles.customerName}>{customer?.name ?? "Manual delivery"}</Text></View>
      <StatusTag status={job.status} />
    </Pressable>
    <View style={styles.routeBlock}><RouteLine label="Pickup" value={job.pickupAddress} /><RouteLine label="Dropoff" value={job.dropoffAddress} /></View>
    {job.notes ? <Text style={styles.noteText}>{job.notes}</Text> : null}
    <View style={styles.jobStats}><Metric label="Distance" value={typeof job.distanceKm === "number" ? `${job.distanceKm.toFixed(1)} km` : "Pending"} small /><Metric label="ETA" value={job.estimatedDurationMinutes ? `${job.estimatedDurationMinutes} min` : "Pending"} small /><Metric label="Fare" value={`Php ${Number(job.finalFare ?? job.estimatedFare ?? 0).toFixed(0)}`} small /></View>
    <View style={styles.buttonRow}><ActionButton label="Order Details" onPress={() => onShowDetails(job)} compact /><ActionButton label="Pickup Map" onPress={() => openMap(job.pickupAddress, job.pickupLatitude, job.pickupLongitude)} compact variant="secondary" /></View>
    <View style={styles.buttonRow}><ActionButton label="Dropoff Map" onPress={() => openMap(job.dropoffAddress, job.dropoffLatitude, job.dropoffLongitude)} compact variant="secondary" />{phone ? <ActionButton label="Call Customer" onPress={() => callPhone(phone)} compact variant="dark" /> : null}</View>
    {nextStatus ? <ActionButton label={formatNextAction(nextStatus)} onPress={() => onUpdateStatus(job, nextStatus)} disabled={busy} compact /> : null}
    <Pressable onPress={() => Alert.alert("Cancel delivery?", "Dispatch will see this job as cancelled.", [{ text: "Keep", style: "cancel" }, { text: "Cancel Delivery", style: "destructive", onPress: () => onUpdateStatus(job, "cancelled") }])} disabled={busy} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel Delivery</Text></Pressable>
  </View>;
}

function OrderDetailsModal({ job, visible, onClose, busy, onUpdateStatus }: { job: DeliveryJob | null; visible: boolean; onClose: () => void; busy: boolean; onUpdateStatus: (job: DeliveryJob, status: JobStatus) => void }) {
  if (!job) return null;
  const customer = job.order?.customer;
  const nextStatus = nextStatusByCurrent[job.status];
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.modalBackdrop}>
      <View style={styles.modalSheet}>
        <View style={styles.modalHandle} />
        <View style={styles.rowBetween}>
          <View style={styles.jobTitleBlock}><Text style={styles.modalEyebrow}>Assigned Delivery</Text><Text style={styles.modalTitle}>{job.order?.orderNumber ?? shortId(job.id)}</Text></View>
          <Pressable onPress={onClose} style={styles.closeButton}><Text style={styles.closeButtonText}>×</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
          <View style={styles.detailStatusRow}><StatusTag status={job.status} /><Text style={styles.detailRequested}>{formatDate(job.requestedAt)}</Text></View>
          <DetailSection title="Customer"><DetailRow label="Name" value={customer?.name ?? "Manual delivery"} /><DetailRow label="Phone" value={customer?.phoneNumber ?? "Not provided"} /></DetailSection>
          {job.order ? <DetailSection title="Order"><DetailRow label="Order number" value={job.order.orderNumber} /><DetailRow label="Items" value={String(job.order.quantity)} /><DetailRow label="Order total" value={`Php ${Number(job.order.totalAmount ?? 0).toFixed(2)}`} /></DetailSection> : null}
          <DetailSection title="Route"><DetailRow label="Pickup" value={job.pickupAddress} /><DetailRow label="Dropoff" value={job.dropoffAddress} /></DetailSection>
          <DetailSection title="Delivery"><DetailRow label="Distance" value={typeof job.distanceKm === "number" ? `${job.distanceKm.toFixed(1)} km` : "Pending"} /><DetailRow label="Estimated time" value={job.estimatedDurationMinutes ? `${job.estimatedDurationMinutes} min` : "Pending"} /><DetailRow label="Estimated arrival" value={job.estimatedArrivalAt ? formatDate(job.estimatedArrivalAt) : "Pending"} /><DetailRow label="Fare" value={`Php ${Number(job.finalFare ?? job.estimatedFare ?? 0).toFixed(2)}`} /></DetailSection>
          {job.notes ? <DetailSection title="Notes"><Text style={styles.detailNotes}>{job.notes}</Text></DetailSection> : null}
          <View style={styles.modalActions}><ActionButton label="Pickup Map" onPress={() => openMap(job.pickupAddress, job.pickupLatitude, job.pickupLongitude)} compact variant="secondary" /><ActionButton label="Dropoff Map" onPress={() => openMap(job.dropoffAddress, job.dropoffLatitude, job.dropoffLongitude)} compact variant="secondary" /></View>
          {customer?.phoneNumber ? <ActionButton label="Call Customer" onPress={() => callPhone(customer.phoneNumber!)} variant="dark" /> : null}
          {nextStatus ? <ActionButton label={formatNextAction(nextStatus)} onPress={() => onUpdateStatus(job, nextStatus)} disabled={busy} /> : null}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.detailSection}><Text style={styles.detailSectionTitle}>{title}</Text>{children}</View>; }
function DetailRow({ label, value }: { label: string; value: string }) { return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>; }
function Metric({ label, value, tone = "default", small = false }: { label: string; value: string; tone?: "default" | "green" | "orange" | "muted"; small?: boolean }) { return <View style={[styles.metric, small && styles.metricSmall]}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, tone === "green" && styles.greenText, tone === "orange" && styles.orangeText, tone === "muted" && styles.mutedText]}>{value}</Text></View>; }
function RouteLine({ label, value }: { label: string; value: string }) { return <View style={styles.routeLine}><View style={styles.routeMarker} /><View style={styles.routeText}><Text style={styles.routeLabel}>{label}</Text><Text style={styles.routeValue}>{value}</Text></View></View>; }
function AvailabilityPill({ status }: { status: RiderStatus }) { return <View style={[styles.pill, status === "online" && styles.pillGreen, status === "busy" && styles.pillOrange]}><Text style={styles.pillText}>{formatStatus(status)}</Text></View>; }
function StatusTag({ status }: { status: JobStatus }) { return <View style={styles.statusTag}><Text style={styles.statusTagText}>{formatStatus(status)}</Text></View>; }
function ActionButton({ label, onPress, disabled, compact, variant = "primary" }: { label: string; onPress: () => void; disabled?: boolean; compact?: boolean; variant?: "primary" | "secondary" | "dark" }) { return <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.actionButton, compact && styles.actionButtonCompact, variant === "secondary" && styles.secondaryButton, variant === "dark" && styles.darkButton, disabled && styles.disabledButton, pressed && !disabled && styles.pressedButton]}><Text style={[styles.actionButtonText, variant !== "primary" && styles.secondaryButtonText]}>{label}</Text></Pressable>; }

async function apiFetch<T>(path: string, token?: string | null, options?: RequestInit): Promise<T> { const response = await fetch(`${API_URL}${path}`, { ...options, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options?.headers ?? {}) } }); if (!response.ok) throw new Error(await response.text()); return response.json() as Promise<T>; }
function openMap(address: string, latitude?: number | null, longitude?: number | null) { const query = latitude != null && longitude != null ? `${latitude},${longitude}` : address; const url = Platform.select({ ios: `maps://?q=${encodeURIComponent(query)}`, android: `geo:0,0?q=${encodeURIComponent(query)}`, default: `https://maps.google.com/?q=${encodeURIComponent(query)}` }); if (url) void Linking.openURL(url); }
function callPhone(phone: string) { void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`); }
function formatNextAction(status: JobStatus) { if (status === "accepted") return "Accept Job"; if (status === "pickup_started") return "Start Pickup"; if (status === "picked_up") return "Mark Picked Up"; if (status === "delivering") return "Start Dropoff"; if (status === "delivered") return "Mark Delivered"; return formatStatus(status); }
function getErrorMessage(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message.replace(/^"|"$/g, "") : fallback; }
function isToday(value: string) { const date = new Date(value); const now = new Date(); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate(); }
function formatStatus(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function shortId(value: string) { return value.slice(-8).toUpperCase(); }

const colors = { background: "#101624", panel: "#171f2f", panelAlt: "#1c2838", text: "#f5f7fb", muted: "#9aa6ba", line: "#2d3a50", accent: "#ef6637", green: "#30d18e", orange: "#f2a84b" };
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background }, centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loginScreen: { flexGrow: 1, justifyContent: "center", padding: 20, gap: 18 }, screen: { padding: 16, paddingBottom: 40, gap: 16 },
  brandMark: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent }, brandMarkText: { color: colors.text, fontSize: 24, fontWeight: "900" },
  loginTitle: { color: colors.text, fontSize: 30, fontWeight: "800" }, loginSubtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }, eyebrow: { color: colors.accent, fontSize: 12, fontWeight: "800", textTransform: "uppercase" }, title: { color: colors.text, fontSize: 27, fontWeight: "800", marginTop: 3 }, subtle: { color: colors.muted, fontSize: 13, lineHeight: 19 }, mutedText: { color: colors.muted }, greenText: { color: colors.green }, orangeText: { color: colors.orange },
  panel: { gap: 12, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel }, input: { height: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: "#0d1421", paddingHorizontal: 14, color: colors.text, fontSize: 15 },
  errorText: { overflow: "hidden", borderRadius: 8, borderWidth: 1, borderColor: "rgba(245,82,96,0.35)", backgroundColor: "rgba(245,82,96,0.12)", color: "#ffd1d6", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, lineHeight: 19 },
  smallButton: { minHeight: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel }, smallButtonText: { color: colors.text, fontWeight: "700" },
  summaryGrid: { flexDirection: "row", gap: 10 }, metric: { flex: 1, minHeight: 74, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelAlt, padding: 12, justifyContent: "center" }, metricSmall: { minHeight: 64, padding: 10 }, metricLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }, metricValue: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 5 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }, sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800" }, buttonRow: { flexDirection: "row", gap: 10 },
  actionButton: { minHeight: 48, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, backgroundColor: colors.accent }, actionButtonCompact: { flex: 1, minHeight: 44, paddingHorizontal: 10 }, actionButtonText: { color: colors.text, fontSize: 14, fontWeight: "800", textAlign: "center" }, secondaryButton: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelAlt }, darkButton: { borderWidth: 1, borderColor: colors.line, backgroundColor: "#0d1421" }, secondaryButtonText: { color: colors.text }, disabledButton: { opacity: 0.45 }, pressedButton: { transform: [{ scale: 0.98 }] },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: "#0d1421", paddingHorizontal: 10, paddingVertical: 6 }, pillGreen: { borderColor: "rgba(48,209,142,0.35)", backgroundColor: "rgba(48,209,142,0.12)" }, pillOrange: { borderColor: "rgba(242,168,75,0.35)", backgroundColor: "rgba(242,168,75,0.12)" }, pillText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  emptyState: { borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: "#0d1421", padding: 16, gap: 5 }, emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  jobCard: { gap: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: 14 }, jobHeaderPressable: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, jobTitleBlock: { flex: 1 }, jobNumber: { color: colors.text, fontSize: 20, fontWeight: "800" }, customerName: { color: colors.muted, fontSize: 14, marginTop: 2 },
  statusTag: { maxWidth: 132, borderRadius: 8, borderWidth: 1, borderColor: "rgba(239,102,55,0.35)", backgroundColor: "rgba(239,102,55,0.12)", paddingHorizontal: 9, paddingVertical: 6 }, statusTagText: { color: "#ffd4c4", fontSize: 11, fontWeight: "800", textAlign: "center" }, routeBlock: { gap: 12 }, routeLine: { flexDirection: "row", gap: 10 }, routeMarker: { width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: colors.accent }, routeText: { flex: 1, gap: 3 }, routeLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" }, routeValue: { color: colors.text, fontSize: 14, lineHeight: 20 }, noteText: { borderRadius: 8, backgroundColor: "#0d1421", color: colors.muted, padding: 10, fontSize: 13, lineHeight: 19 }, jobStats: { flexDirection: "row", gap: 8 }, cancelButton: { minHeight: 40, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(245,82,96,0.35)", backgroundColor: "rgba(245,82,96,0.09)" }, cancelButtonText: { color: "#ffd1d6", fontWeight: "800" },
  historyItem: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: "#0d1421", padding: 12 }, historyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green }, historyBody: { flex: 1 }, historyTitle: { color: colors.text, fontWeight: "800" }, historyFare: { color: colors.text, fontWeight: "800" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" }, modalSheet: { maxHeight: "90%", borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.panel, paddingTop: 10, paddingHorizontal: 16, paddingBottom: 22, borderWidth: 1, borderColor: colors.line }, modalHandle: { alignSelf: "center", width: 42, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 }, modalEyebrow: { color: colors.accent, fontSize: 11, fontWeight: "800", textTransform: "uppercase" }, modalTitle: { color: colors.text, fontSize: 24, fontWeight: "900", marginTop: 3 }, closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.panelAlt, alignItems: "center", justifyContent: "center" }, closeButtonText: { color: colors.text, fontSize: 28, lineHeight: 30, fontWeight: "300" }, modalContent: { paddingTop: 14, paddingBottom: 8, gap: 14 }, detailStatusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, detailRequested: { color: colors.muted, fontSize: 12 }, detailSection: { borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: "#0d1421", padding: 13, gap: 10 }, detailSectionTitle: { color: colors.text, fontSize: 14, fontWeight: "900", marginBottom: 2 }, detailRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }, detailLabel: { color: colors.muted, fontSize: 12, flex: 0.8 }, detailValue: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: "700", flex: 1.6, textAlign: "right" }, detailNotes: { color: colors.muted, fontSize: 13, lineHeight: 20 }, modalActions: { flexDirection: "row", gap: 10 }
});
