import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import RiderMapView from "./RiderMapView";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://empanadahauz.com/api";
const TOKEN_KEY = "empanada-rider-token";
type RiderStatus = "offline" | "online" | "busy" | "suspended";
type JobStatus = "requested" | "searching_rider" | "assigned" | "accepted" | "pickup_started" | "picked_up" | "delivering" | "delivered" | "cancelled";
type User = { id: string; name: string; email: string; role: string };
type Rider = { id: string; phoneNumber?: string | null; status: RiderStatus; serviceArea?: string | null; rating: number; completedJobs: number; user: User; vehicles: Array<{ type: string; plateNumber?: string | null; model?: string | null; color?: string | null }>; locations: Array<{ latitude: number; longitude: number; createdAt: string }> };
type Job = { id: string; status: JobStatus; pickupAddress: string; pickupLatitude?: number | null; pickupLongitude?: number | null; dropoffAddress: string; dropoffLatitude?: number | null; dropoffLongitude?: number | null; distanceKm?: number | null; estimatedDurationMinutes?: number | null; estimatedArrivalAt?: string | null; estimatedFare: number; finalFare?: number | null; notes?: string | null; requestedAt: string; order?: { orderNumber: string; totalAmount: number; quantity: number; customer: { name: string; phoneNumber?: string | null } } | null };
type Session = { accessToken: string; user: User };
type Tab = "home" | "deliveries" | "earnings" | "profile";
const active: JobStatus[] = ["assigned", "accepted", "pickup_started", "picked_up", "delivering"];
const next: Partial<Record<JobStatus, JobStatus>> = { assigned: "accepted", accepted: "pickup_started", pickup_started: "picked_up", picked_up: "delivering", delivering: "delivered" };
const statusTone: Partial<Record<JobStatus, { bg: string; border: string; text: string; solid: string }>> = {
  assigned: { bg: "rgba(130,150,255,.14)", border: "rgba(130,150,255,.35)", text: "#c7d1ff", solid: "#8296ff" },
  accepted: { bg: "rgba(255,193,90,.14)", border: "rgba(255,193,90,.35)", text: "#ffe2b0", solid: "#ffc15a" },
  pickup_started: { bg: "rgba(239,102,55,.14)", border: "rgba(239,102,55,.35)", text: "#ffd4c4", solid: "#ef6637" },
  picked_up: { bg: "rgba(94,196,255,.14)", border: "rgba(94,196,255,.35)", text: "#c9ecff", solid: "#5ec4ff" },
  delivering: { bg: "rgba(48,209,142,.14)", border: "rgba(48,209,142,.35)", text: "#b9f2da", solid: "#30d18e" },
  delivered: { bg: "rgba(48,209,142,.14)", border: "rgba(48,209,142,.35)", text: "#b9f2da", solid: "#30d18e" },
  cancelled: { bg: "rgba(255,109,109,.14)", border: "rgba(255,109,109,.35)", text: "#ffc9c9", solid: "#ff6d6d" }
};
const defaultTone = { bg: "rgba(130,150,255,.14)", border: "rgba(130,150,255,.35)", text: "#c7d1ff", solid: "#8296ff" };

export default function RiderTabbedApp({ onLocation }: { onLocation?: (coords: { latitude: number; longitude: number; heading?: number; speed?: number }) => void }) {
  const [booting, setBooting] = useState(true), [token, setToken] = useState<string | null>(null), [rider, setRider] = useState<Rider | null>(null), [jobs, setJobs] = useState<Job[]>([]), [tab, setTab] = useState<Tab>("home"), [selected, setSelected] = useState<Job | null>(null), [mapJob, setMapJob] = useState<Job | null>(null), [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false), [error, setError] = useState<string | null>(null), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [locationMessage, setLocationMessage] = useState<string | null>(null);

  const load = useCallback(async (t = token) => { if (!t) return; const [p, j] = await Promise.all([apiFetch<Rider>("/rider/me", t), apiFetch<Job[]>("/rider/jobs", t)]); setRider(p); setJobs(j); }, [token]);
  useEffect(() => { void (async () => { try { const t = await SecureStore.getItemAsync(TOKEN_KEY); if (t) { setToken(t); await load(t); } } catch { await SecureStore.deleteItemAsync(TOKEN_KEY); } finally { setBooting(false); } })(); }, []);
  const activeJobs = useMemo(() => jobs.filter(j => active.includes(j.status)), [jobs]);
  const completed = useMemo(() => jobs.filter(j => j.status === "delivered" || j.status === "cancelled"), [jobs]);
  const delivered = useMemo(() => jobs.filter(j => j.status === "delivered"), [jobs]);
  const earnings = delivered.reduce((s, j) => s + Number(j.finalFare ?? j.estimatedFare ?? 0), 0);

  // Continuous location sharing while the rider is online/busy - keeps the
  // server (and anyone watching the delivery map) up to date automatically
  // instead of relying only on the manual "Send GPS Check-In" button.
  useEffect(() => {
    if (!token || !rider || rider.status === "offline" || rider.status === "suspended") return;
    let subscription: Location.LocationSubscription | null = null;
    let lastSentAt = 0;
    let cancelled = false;
    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted" || cancelled) return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 25 },
        (pos) => {
          const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, heading: pos.coords.heading ?? undefined, speed: pos.coords.speed ?? undefined };
          onLocation?.(coords);
          const now = Date.now();
          if (now - lastSentAt < 8000) return;
          lastSentAt = now;
          void apiFetch("/rider/location", token, { method: "POST", body: JSON.stringify(coords) }).catch(() => undefined);
        }
      );
    })();
    return () => { cancelled = true; subscription?.remove(); };
  }, [token, rider?.status, onLocation]);

  async function login() { if (!email.trim() || password.length < 8) return setError("Enter your rider email and password."); setBusy(true); setError(null); try { const s = await apiFetch<Session>("/auth/login", undefined, { method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase(), password }) }); if (s.user.role !== "rider") throw new Error("This account is not a rider account."); await SecureStore.setItemAsync(TOKEN_KEY, s.accessToken); setToken(s.accessToken); await load(s.accessToken); setPassword(""); } catch (e) { setError(message(e, "Login failed.")); } finally { setBusy(false); } }
  async function logout() { await SecureStore.deleteItemAsync(TOKEN_KEY); setToken(null); setRider(null); setJobs([]); }
  async function updateStatus(status: RiderStatus) { if (!token) return; setBusy(true); try { setRider(await apiFetch<Rider>("/rider/status", token, { method: "PATCH", body: JSON.stringify({ status }) })); } catch (e) { setError(message(e, "Unable to update availability.")); } finally { setBusy(false); } }
  async function updateJob(job: Job, status: JobStatus) { if (!token) return; setBusy(true); try { const updated = await apiFetch<Job>(`/rider/jobs/${job.id}/status`, token, { method: "PATCH", body: JSON.stringify({ status }) }); setJobs(x => x.map(j => j.id === job.id ? updated : j)); setSelected(x => x?.id === job.id ? updated : x); setMapJob(x => x?.id === job.id ? updated : x); await load(token); } catch (e) { setError(message(e, "Unable to update delivery.")); } finally { setBusy(false); } }
  async function gps() { if (!token) return; setBusy(true); try { const p = await Location.requestForegroundPermissionsAsync(); if (p.status !== "granted") throw new Error("Location permission is required."); const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, heading: pos.coords.heading ?? undefined, speed: pos.coords.speed ?? undefined }; await apiFetch("/rider/location", token, { method: "POST", body: JSON.stringify(coords) }); onLocation?.(coords); setLocationMessage(`GPS updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`); await load(token); } catch (e) { setError(message(e, "Unable to update GPS.")); } finally { setBusy(false); } }
  async function refresh() { setRefreshing(true); try { await load(); } catch (e) { setError(message(e, "Unable to refresh.")); } finally { setRefreshing(false); } }

  if (booting) return <SafeAreaView style={s.safe}><StatusBar style="dark" /><View style={s.center}><ActivityIndicator color="#ef6637" /><Text style={s.muted}>Loading rider app</Text></View></SafeAreaView>;
  if (!token || !rider) return <Login email={email} setEmail={setEmail} password={password} setPassword={setPassword} busy={busy} error={error} onLogin={login} />;
  return <SafeAreaView style={s.safe}><StatusBar style="dark" /><View style={{ flex: 1 }}>
    {error ? <Text style={s.error}>{error}</Text> : null}
    {tab === "home" && <Home rider={rider} activeJobs={activeJobs} earnings={earnings} busy={busy} onStatus={updateStatus} onGps={gps} locationMessage={locationMessage} onJob={setSelected} onOpenMap={setMapJob} />}
    {tab === "deliveries" && <Deliveries jobs={jobs} busy={busy} onJob={setSelected} onUpdate={updateJob} onOpenMap={setMapJob} refreshing={refreshing} onRefresh={refresh} />}
    {tab === "earnings" && <Earnings rider={rider} delivered={delivered} completed={completed} earnings={earnings} />}
    {tab === "profile" && <Profile rider={rider} onLogout={logout} />}
    <View style={s.tabs}>{([ ["home", "Home", "⌂"], ["deliveries", "Deliveries", "▣"], ["earnings", "Earnings", "₱"], ["profile", "Profile", "●"] ] as const).map(([key, label, icon]) => <Pressable key={key} onPress={() => setTab(key)} style={[s.tab, tab === key && s.tabActive]}><Text style={[s.tabIcon, tab === key && s.tabTextActive]}>{icon}</Text><Text style={[s.tabLabel, tab === key && s.tabTextActive]}>{label}</Text>{key === "deliveries" && activeJobs.length > 0 ? <View style={s.badge}><Text style={s.badgeText}>{activeJobs.length}</Text></View> : null}</Pressable>)}</View>
  </View><Details job={selected} visible={!!selected} onClose={() => setSelected(null)} busy={busy} onUpdate={updateJob} onOpenMap={(j) => { setSelected(null); setMapJob(j); }} /><JobMapSheet job={mapJob} rider={rider} visible={!!mapJob} onClose={() => setMapJob(null)} busy={busy} onUpdate={updateJob} /></SafeAreaView>;
}

function Login(p: { email: string; setEmail: (v: string) => void; password: string; setPassword: (v: string) => void; busy: boolean; error: string | null; onLogin: () => void }) { return <SafeAreaView style={s.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={s.login}><View style={s.logo}><Text style={s.logoText}>EH</Text></View><Text style={s.title}>Empanada Hauz Rider</Text><Text style={s.muted}>Sign in with your rider account.</Text><View style={s.panel}>{p.error ? <Text style={s.error}>{p.error}</Text> : null}<TextInput style={s.input} placeholder="Email" placeholderTextColor="#b19a86" autoCapitalize="none" keyboardType="email-address" value={p.email} onChangeText={p.setEmail} /><TextInput style={s.input} placeholder="Password" placeholderTextColor="#b19a86" secureTextEntry value={p.password} onChangeText={p.setPassword} /><Button label={p.busy ? "Signing in..." : "Sign In"} onPress={p.onLogin} disabled={p.busy} /></View></ScrollView></SafeAreaView>; }
function Header({ title, subtitle }: { title: string; subtitle?: string }) { return <View style={s.headerBand}><Text style={s.eyebrowLight}>Rider App</Text><Text style={s.pageTitleLight}>{title}</Text>{subtitle ? <Text style={s.subtitleLight}>{subtitle}</Text> : null}</View>; }
function Home({ rider, activeJobs, earnings, busy, onStatus, onGps, locationMessage, onJob, onOpenMap }: { rider: Rider; activeJobs: Job[]; earnings: number; busy: boolean; onStatus: (x: RiderStatus) => void; onGps: () => void; locationMessage: string | null; onJob: (j: Job) => void; onOpenMap: (j: Job) => void }) { const current = activeJobs[0]; return <ScrollView contentContainerStyle={s.screen}><Header title={`Hi, ${rider.user.name.split(" ")[0]}`} subtitle={rider.serviceArea ?? "Ready for today's deliveries"} /><View style={s.grid}><Metric label="Status" value={format(rider.status)} /><Metric label="Active" value={String(activeJobs.length)} /><Metric label="Today" value={`₱${earnings.toFixed(0)}`} /></View><View style={s.panel}><View style={s.row}><View><Text style={s.section}>Availability</Text><Text style={s.muted}>{rider.status === "busy" ? "On a delivery" : "Accepting dispatch jobs"}</Text></View><Tag text={format(rider.status)} /></View><View style={s.row}><Button label="Go Online" onPress={() => onStatus("online")} compact disabled={busy || rider.status === "online"} /><Button label="Offline" onPress={() => onStatus("offline")} compact secondary disabled={busy || rider.status === "offline"} /></View><Button label={locationMessage ?? "Send GPS Check-In"} onPress={onGps} disabled={busy} secondary /></View><Text style={s.section}>Current Delivery</Text>{current ? <JobCard job={current} onDetails={onJob} onOpenMap={onOpenMap} /> : <View style={s.empty}><Text style={s.section}>No active delivery</Text><Text style={s.muted}>Your next assigned delivery will appear here.</Text></View>}</ScrollView>; }
function Deliveries({ jobs, busy, onJob, onUpdate, onOpenMap, refreshing, onRefresh }: { jobs: Job[]; busy: boolean; onJob: (j: Job) => void; onUpdate: (j: Job, st: JobStatus) => void; onOpenMap: (j: Job) => void; refreshing: boolean; onRefresh: () => void }) { const activeJobs = jobs.filter(j => active.includes(j.status)); const history = jobs.filter(j => j.status === "delivered" || j.status === "cancelled"); return <ScrollView contentContainerStyle={s.screen} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ef6637" />}><Header title="Deliveries" subtitle="Today's assigned deliveries" /><Text style={s.section}>Assigned ({activeJobs.length})</Text>{activeJobs.length ? activeJobs.map(j => <JobCard key={j.id} job={j} onDetails={onJob} onUpdate={onUpdate} onOpenMap={onOpenMap} busy={busy} />) : <View style={s.empty}><Text style={s.section}>No assigned deliveries</Text><Text style={s.muted}>There are no active deliveries for today.</Text></View>}<Text style={[s.section, { marginTop: 8 }]}>Completed Today ({history.length})</Text>{history.map(j => <JobCard key={j.id} job={j} onDetails={onJob} onOpenMap={onOpenMap} compact />)}</ScrollView>; }
function Earnings({ rider, delivered, completed, earnings }: { rider: Rider; delivered: Job[]; completed: Job[]; earnings: number }) { return <ScrollView contentContainerStyle={s.screen}><Header title="Earnings" subtitle="Today's delivery performance" /><View style={s.grid}><Metric label="Today's Earnings" value={`₱${earnings.toFixed(2)}`} /><Metric label="Delivered" value={String(delivered.length)} /><Metric label="Completed Total" value={String(rider.completedJobs)} /></View><View style={s.panel}><Text style={s.section}>Today's Earnings</Text>{delivered.length ? delivered.map(j => <View key={j.id} style={s.history}><View><Text style={s.itemTitle}>{j.order?.orderNumber ?? short(j.id)}</Text><Text style={s.muted}>{j.dropoffAddress}</Text></View><Text style={s.money}>₱{Number(j.finalFare ?? j.estimatedFare ?? 0).toFixed(2)}</Text></View>) : <Text style={s.muted}>No delivered orders today.</Text>}</View><View style={s.panel}><Text style={s.section}>Completed Jobs</Text><Text style={s.muted}>{completed.length} jobs are included in the current delivery history.</Text></View></ScrollView>; }
function Profile({ rider, onLogout }: { rider: Rider; onLogout: () => void }) { const v = rider.vehicles[0]; return <ScrollView contentContainerStyle={s.screen}><Header title="Profile" subtitle="Your rider account" /><View style={s.profile}><View style={s.avatar}><Text style={s.avatarText}>{rider.user.name.charAt(0).toUpperCase()}</Text></View><Text style={s.profileName}>{rider.user.name}</Text><Text style={s.muted}>{rider.user.email}</Text></View><View style={s.panel}><Row label="Phone" value={rider.phoneNumber ?? "Not provided"} /><Row label="Service area" value={rider.serviceArea ?? "All areas"} /><Row label="Rating" value={`${Number(rider.rating ?? 0).toFixed(1)} / 5`} /><Row label="Completed jobs" value={String(rider.completedJobs)} /><Row label="Vehicle" value={v ? `${format(v.type)} ${v.model ?? ""}`.trim() : "Not assigned"} /><Row label="Plate" value={v?.plateNumber ?? "Not provided"} /></View><Button label="Sign Out" onPress={onLogout} secondary /></ScrollView>; }
function JobCard({ job, onDetails, onUpdate, onOpenMap, busy, compact = false }: { job: Job; onDetails: (j: Job) => void; onUpdate?: (j: Job, st: JobStatus) => void; onOpenMap: (j: Job) => void; busy?: boolean; compact?: boolean }) {
  const n = next[job.status];
  const tone = statusTone[job.status] ?? defaultTone;
  return (
    <View style={[s.card, compact && s.cardCompact, { borderLeftColor: tone.solid, borderLeftWidth: 4 }]}>
      <Pressable onPress={() => onDetails(job)}>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.itemTitle}>{job.order?.orderNumber ?? short(job.id)}</Text>
            <Text style={s.customer}>{job.order?.customer.name ?? "Manual delivery"}</Text>
          </View>
          <View style={[s.statusPill, { backgroundColor: tone.bg, borderColor: tone.border }]}><Text style={[s.statusPillText, { color: tone.text }]}>{format(job.status)}</Text></View>
        </View>
        {!compact && (
          <View style={s.routeBlock}>
            <View style={s.routeLine}>
              <View style={s.routeDots}><View style={s.dotPickup} /><View style={s.dotConnector} /><View style={s.dotDropoff} /></View>
              <View style={{ flex: 1, gap: 10 }}>
                <Text style={s.routeAddress} numberOfLines={1}>{job.pickupAddress}</Text>
                <Text style={s.routeAddress} numberOfLines={1}>{job.dropoffAddress}</Text>
              </View>
            </View>
          </View>
        )}
      </Pressable>
      {!compact && (
        <View style={s.cardFooter}>
          <View style={s.grid}>
            <Metric label="Distance" value={job.distanceKm != null ? `${job.distanceKm.toFixed(1)} km` : "—"} />
            <Metric label="Fare" value={`₱${Number(job.finalFare ?? job.estimatedFare ?? 0).toFixed(0)}`} />
          </View>
          {n && onUpdate ? <Button label={action(n)} onPress={() => onOpenMap(job)} disabled={busy} /> : <Button label="View Details" onPress={() => onDetails(job)} secondary />}
        </View>
      )}
    </View>
  );
}
function Details({ job, visible, onClose, busy, onUpdate, onOpenMap }: { job: Job | null; visible: boolean; onClose: () => void; busy: boolean; onUpdate: (j: Job, st: JobStatus) => void; onOpenMap: (j: Job) => void }) { if (!job) return null; const n = next[job.status], c = job.order?.customer; return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={s.backdrop}><View style={s.sheet}><View style={s.handle} /><View style={s.row}><View style={{ flex: 1 }}><Text style={s.eyebrow}>ORDER DETAILS</Text><Text style={s.pageTitle}>{job.order?.orderNumber ?? short(job.id)}</Text></View><Pressable onPress={onClose}><Text style={s.close}>×</Text></Pressable></View><ScrollView contentContainerStyle={{ gap: 16 }}><Tag text={format(job.status)} /><View style={s.panel}><Text style={s.section}>Customer</Text><Row label="Name" value={c?.name ?? "Manual delivery"} /><Row label="Phone" value={c?.phoneNumber ?? "Not provided"} /></View><View style={s.panel}><Text style={s.section}>Route</Text><Row label="Pickup" value={job.pickupAddress} /><Row label="Drop-off" value={job.dropoffAddress} /></View>{job.order ? <View style={s.panel}><Text style={s.section}>Order</Text><Row label="Items" value={String(job.order.quantity)} /><Row label="Order total" value={`₱${Number(job.order.totalAmount).toFixed(2)}`} /></View> : null}<View style={s.panel}><Text style={s.section}>Delivery</Text><Row label="Distance" value={job.distanceKm != null ? `${job.distanceKm.toFixed(1)} km` : "Pending"} /><Row label="ETA" value={job.estimatedDurationMinutes ? `${job.estimatedDurationMinutes} min` : "Pending"} /><Row label="Fare" value={`₱${Number(job.finalFare ?? job.estimatedFare ?? 0).toFixed(2)}`} /></View>{job.notes ? <View style={s.panel}><Text style={s.section}>Notes</Text><Text style={s.muted}>{job.notes}</Text></View> : null}<View style={s.row}><Button label="Open Map" onPress={() => onOpenMap(job)} compact secondary /><Button label="Call" onPress={() => c?.phoneNumber && Linking.openURL(`tel:${c.phoneNumber}`)} compact secondary disabled={!c?.phoneNumber} /></View>{n ? <Button label={action(n)} onPress={() => onUpdate(job, n)} disabled={busy} /> : null}</ScrollView></View></View></Modal>; }
function JobMapSheet({ job, rider, visible, onClose, busy, onUpdate }: { job: Job | null; rider: Rider | null; visible: boolean; onClose: () => void; busy: boolean; onUpdate: (j: Job, st: JobStatus) => void }) {
  if (!job) return null;
  const n = next[job.status];
  const c = job.order?.customer;
  const last = rider?.locations?.[0];
  const riderLocation = last ? { latitude: last.latitude, longitude: last.longitude } : null;
  const pickup = job.pickupLatitude != null && job.pickupLongitude != null ? { latitude: job.pickupLatitude, longitude: job.pickupLongitude } : null;
  const dropoff = job.dropoffLatitude != null && job.dropoffLongitude != null ? { latitude: job.dropoffLatitude, longitude: job.dropoffLongitude } : null;
  const headedTo = job.status === "assigned" || job.status === "accepted" ? "Pickup" : "Drop-off";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.mapSheetRoot}>
        <RiderMapView riderLocation={riderLocation} pickup={pickup} dropoff={dropoff} pickupAddress={job.pickupAddress} dropoffAddress={job.dropoffAddress} onClose={onClose} />
        <View style={s.mapOverlayCard}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>HEADING TO {headedTo.toUpperCase()}</Text>
              <Text style={s.pageTitle}>{job.order?.orderNumber ?? short(job.id)}</Text>
            </View>
            <Text style={s.overlayFare}>₱{Number(job.finalFare ?? job.estimatedFare ?? 0).toFixed(0)}</Text>
          </View>
          <View style={s.overlayRow}>
            <Text style={s.customer}>{c?.name ?? "Manual delivery"}</Text>
            <Text style={s.muted}>{job.distanceKm != null ? `${job.distanceKm.toFixed(1)} km away` : "Distance pending"}</Text>
          </View>
          <Text style={s.address} numberOfLines={2}>{headedTo === "Pickup" ? job.pickupAddress : job.dropoffAddress}</Text>
          <View style={s.row}>
            <Button label="Call" onPress={() => c?.phoneNumber && Linking.openURL(`tel:${c.phoneNumber}`)} compact secondary disabled={!c?.phoneNumber} />
            <Button label="External Nav" onPress={() => openMap(headedTo === "Pickup" ? job.pickupAddress : job.dropoffAddress, headedTo === "Pickup" ? job.pickupLatitude : job.dropoffLatitude, headedTo === "Pickup" ? job.pickupLongitude : job.dropoffLongitude)} compact secondary />
          </View>
          {n ? <Button label={action(n)} onPress={() => onUpdate(job, n)} disabled={busy} /> : <Button label="Close" onPress={onClose} secondary />}
        </View>
      </View>
    </Modal>
  );
}
function Row({ label, value }: { label: string; value: string }) { return <View style={s.detailRow}><Text style={s.muted}>{label}</Text><Text style={s.detailValue}>{value}</Text></View>; }
function Metric({ label, value }: { label: string; value: string }) { return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}</Text></View>; }
function Tag({ text }: { text: string }) { return <View style={s.tag}><Text style={s.tagText}>{text}</Text></View>; }
function Button({ label, onPress, disabled, compact, secondary }: { label: string; onPress: () => void; disabled?: boolean; compact?: boolean; secondary?: boolean }) { return <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.button, compact && s.buttonCompact, secondary && s.buttonSecondary, disabled && { opacity: .4 }, pressed && { opacity: .8 }]}><Text style={s.buttonText}>{label}</Text></Pressable>; }
function openMap(address: string, lat?: number | null, lng?: number | null) { const q = lat != null && lng != null ? `${lat},${lng}` : address; const u = Platform.select({ ios: `maps://?q=${encodeURIComponent(q)}`, android: `geo:0,0?q=${encodeURIComponent(q)}`, default: `https://maps.google.com/?q=${encodeURIComponent(q)}` }); if (u) void Linking.openURL(u); }
function action(st: JobStatus) { return st === "accepted" ? "Accept Job" : st === "pickup_started" ? "Start Pickup" : st === "picked_up" ? "Mark Picked Up" : st === "delivering" ? "Start Dropoff" : st === "delivered" ? "Mark Delivered" : format(st); }
function format(v: string) { return v.replaceAll("_", " ").replace(/\b\w/g, x => x.toUpperCase()); }
function short(v: string) { return v.slice(-8).toUpperCase(); }
function message(e: unknown, fallback: string) { return e instanceof Error && e.message ? e.message.replace(/^"|"$/g, "") : fallback; }
async function apiFetch<T>(path: string, token?: string, options?: RequestInit): Promise<T> { const r = await fetch(`${API_URL}${path}`, { ...options, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options?.headers ?? {}) } }); if (!r.ok) throw new Error(await r.text()); return r.json() as Promise<T>; }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fdf3e6" }, center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#fdf3e6" }, login: { flexGrow: 1, justifyContent: "center", padding: 20, gap: 16 }, logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: "#ef6637", alignItems: "center", justifyContent: "center" }, logoText: { color: "#fff", fontSize: 24, fontWeight: "900" }, title: { color: "#2a1c14", fontSize: 28, fontWeight: "800" }, pageTitle: { color: "#2a1c14", fontSize: 25, fontWeight: "800", marginTop: 3 }, eyebrow: { color: "#ef6637", fontSize: 11, fontWeight: "800", letterSpacing: 1 }, muted: { color: "#8a7263", fontSize: 13, lineHeight: 19 }, error: { margin: 12, color: "#8a1f1f", backgroundColor: "#ffd9d3", borderRadius: 8, padding: 10 }, screen: { padding: 16, paddingBottom: 100, gap: 14 }, pageHeader: { gap: 2, marginBottom: 4 },
  headerBand: { backgroundColor: "#ef6637", borderRadius: 20, paddingHorizontal: 18, paddingVertical: 18, marginBottom: 6, gap: 2, shadowColor: "#c94e22", shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }, eyebrowLight: { color: "rgba(255,255,255,.85)", fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" }, pageTitleLight: { color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 3 }, subtitleLight: { color: "rgba(255,255,255,.88)", fontSize: 13, marginTop: 2 },
  grid: { flexDirection: "row", gap: 8 }, metric: { flex: 1, backgroundColor: "#fff", borderColor: "#f3e2d0", borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 62, justifyContent: "center", shadowColor: "#c9a583", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, metricLabel: { color: "#a4907e", fontSize: 10, fontWeight: "700", textTransform: "uppercase" }, metricValue: { color: "#2a1c14", fontSize: 16, fontWeight: "800", marginTop: 4 }, panel: { backgroundColor: "#fff", borderColor: "#f3e2d0", borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, shadowColor: "#c9a583", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 }, section: { color: "#2a1c14", fontSize: 17, fontWeight: "800" }, row: { flexDirection: "row", alignItems: "center", gap: 9 }, button: { flex: 1, minHeight: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: "#ef6637", alignItems: "center", justifyContent: "center" }, buttonCompact: { minHeight: 42, paddingHorizontal: 9 }, buttonSecondary: { backgroundColor: "#fff", borderColor: "#f0c9ae", borderWidth: 1.5 }, buttonText: { color: "#fff", fontWeight: "800", fontSize: 13, textAlign: "center" }, input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: "#f0d9c2", backgroundColor: "#fff", color: "#2a1c14", paddingHorizontal: 13 }, card: { backgroundColor: "#fff", borderColor: "#f3e2d0", borderWidth: 1, borderRadius: 14, padding: 14, gap: 12, shadowColor: "#c9a583", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, cardCompact: { paddingVertical: 11 }, itemTitle: { color: "#2a1c14", fontSize: 16, fontWeight: "800" }, customer: { color: "#8a7263", fontSize: 13, marginTop: 2 }, address: { color: "#2a1c14", fontSize: 14, lineHeight: 20, marginTop: -7 }, tag: { alignSelf: "flex-start", backgroundColor: "rgba(239,102,55,.10)", borderColor: "rgba(239,102,55,.35)", borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }, tagText: { color: "#c94e22", fontSize: 10, fontWeight: "800" }, empty: { backgroundColor: "#fff", borderColor: "#f3e2d0", borderWidth: 1, borderRadius: 14, padding: 16, gap: 4 }, history: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f3e2d0" }, money: { color: "#1f9c63", fontWeight: "800" }, detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#f3e2d0" }, detailValue: { color: "#2a1c14", flex: 1, textAlign: "right", fontSize: 13 }, profile: { alignItems: "center", paddingVertical: 20, gap: 5 }, avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#ef6637", alignItems: "center", justifyContent: "center" }, avatarText: { color: "#fff", fontSize: 30, fontWeight: "900" }, profileName: { color: "#2a1c14", fontSize: 22, fontWeight: "800" }, tabs: { position: "absolute", left: 0, right: 0, bottom: 0, height: 72, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#f3e2d0", flexDirection: "row", paddingBottom: 8, shadowColor: "#c9a583", shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: -3 }, elevation: 8 }, tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 }, tabActive: { backgroundColor: "rgba(239,102,55,.09)" }, tabIcon: { color: "#b19a86", fontSize: 19, fontWeight: "800" }, tabLabel: { color: "#b19a86", fontSize: 10, fontWeight: "700" }, tabTextActive: { color: "#ef6637" }, badge: { position: "absolute", top: 8, right: "24%", minWidth: 17, height: 17, borderRadius: 9, backgroundColor: "#ef6637", alignItems: "center", justifyContent: "center" }, badgeText: { color: "#fff", fontSize: 9, fontWeight: "900" }, backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(42,28,20,.45)" }, sheet: { maxHeight: "88%", backgroundColor: "#fdf3e6", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 14 }, handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: "#e6c6a5", alignSelf: "center" }, close: { color: "#2a1c14", fontSize: 30, lineHeight: 30 },
  statusPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 }, statusPillText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  routeBlock: { marginTop: 12 }, routeLine: { flexDirection: "row", gap: 10 }, routeDots: { width: 10, alignItems: "center", paddingTop: 4 }, dotPickup: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef6637" }, dotConnector: { width: 1, flex: 1, minHeight: 16, backgroundColor: "#f0d9c2", marginVertical: 3 }, dotDropoff: { width: 8, height: 8, borderRadius: 2, backgroundColor: "#2a8fc9" }, routeAddress: { color: "#2a1c14", fontSize: 13, lineHeight: 18 },
  cardFooter: { marginTop: 14, gap: 12 },
  mapSheetRoot: { flex: 1, backgroundColor: "#101521" }, mapOverlayCard: { position: "absolute", left: 12, right: 12, bottom: 24, backgroundColor: "#fff", borderColor: "#f3e2d0", borderWidth: 1, borderRadius: 18, padding: 16, gap: 12, shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }, overlayFare: { color: "#1f9c63", fontSize: 20, fontWeight: "900" }, overlayRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }
});

function App() { return <SafeAreaProvider><RiderTabbedApp /></SafeAreaProvider>; }
