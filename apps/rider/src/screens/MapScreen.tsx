import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RiderMap, RiderMapHandle } from "../components/RiderMap";
import { getRiderRoute } from "../api";
import { RiderSession } from "../hooks/useRiderSession";
import { colors, radius, shadow, spacing } from "../theme";
import { Coordinate, JOB_NEXT_STATUS, jobActionLabel, shortJobCode } from "../types";

const CEBU_CENTER = { latitude: 10.3157, longitude: 123.8854, latitudeDelta: 0.08, longitudeDelta: 0.08 };
function valid(point?: Coordinate | null): point is Coordinate { return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude); }
function regionFor(points: Coordinate[]) {
  const p = points.filter(valid); if (!p.length) return CEBU_CENTER;
  const lats = p.map(x => x.latitude), lngs = p.map(x => x.longitude);
  return { latitude: (Math.min(...lats) + Math.max(...lats)) / 2, longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2, latitudeDelta: Math.max(.015, (Math.max(...lats) - Math.min(...lats)) * 1.6), longitudeDelta: Math.max(.015, (Math.max(...lngs) - Math.min(...lngs)) * 1.6) };
}

export function MapScreen({ session, jobId, onBack }: { session: RiderSession; jobId?: string | null; onBack: () => void }) {
  const { rider, activeJobs, liveLocation, busy, advanceJob, token } = session;
  const mapRef = useRef<RiderMapHandle>(null);
  const currentJob = (jobId ? session.jobs.find(job => job.id === jobId) : null) ?? session.currentJob;
  const riderLocation = liveLocation ?? rider?.locations?.[0] ?? null;
  const pickup = currentJob && valid({ latitude: currentJob.pickupLatitude as number, longitude: currentJob.pickupLongitude as number }) ? { latitude: currentJob.pickupLatitude as number, longitude: currentJob.pickupLongitude as number } : null;
  const dropoff = currentJob && valid({ latitude: currentJob.dropoffLatitude as number, longitude: currentJob.dropoffLongitude as number }) ? { latitude: currentJob.dropoffLatitude as number, longitude: currentJob.dropoffLongitude as number } : null;
  const goingToDropoff = !!currentJob && ["picked_up", "delivering"].includes(currentJob.status);
  const destination = goingToDropoff ? dropoff : pickup ?? dropoff;
  const region = useMemo(() => regionFor([riderLocation, pickup, dropoff].filter(valid) as Coordinate[]), [riderLocation?.latitude, riderLocation?.longitude, pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude]);
  const [route, setRoute] = useState<Coordinate[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setRoute([]);
    if (!token || !riderLocation || !destination) return;
    void getRiderRoute(token, riderLocation, destination).then(result => {
      if (cancelled) return;
      const geometry = result.routes?.[0]?.geometry?.coordinates;
      if (geometry?.length) setRoute(geometry.map(([longitude, latitude]) => ({ latitude, longitude })));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [token, riderLocation?.latitude, riderLocation?.longitude, destination?.latitude, destination?.longitude]);

  const completeEnabled = !!currentJob && currentJob.status === "delivering" && !!riderLocation && !!dropoff;
  const distanceKm = currentJob?.distanceKm ?? null;

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <View style={styles.topBar}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
      <View style={styles.brandBlock}><Text style={styles.brand}>Empanada</Text><Text style={styles.brandAccent}>Hauz</Text></View>
      <Text style={styles.status}>{rider?.status === "online" ? "Online" : "Offline"}</Text>
    </View>

    <View style={styles.statsRow}><Stat value={String(activeJobs.length)} label="Active Orders" /><Stat value={`₱${session.todayEarnings.toFixed(0)}`} label="Today's Earnings" /><Stat value={`${rider?.rating?.toFixed(1) ?? "5.0"} ⭐`} label="Rider Rating" /></View>
    <View style={styles.mapWrap}><RiderMap ref={mapRef} region={region} riderLocation={riderLocation} pickup={pickup} dropoff={dropoff} destination={destination} route={route} /></View>

    {currentJob && drawerOpen ? <View style={[styles.drawer, shadow.float]}>
      <Pressable onPress={() => setDrawerOpen(false)} style={styles.drawerHandle}><View style={styles.handle} /><Text style={styles.swipeHint}>Swipe or tap header to hide</Text></Pressable>
      <View style={styles.drawerRow}><View style={styles.food}><Text style={{ fontSize: 22 }}>🥟</Text></View><View style={{ flex: 1 }}><Text style={styles.orderNo}>Order #{currentJob.order?.orderNumber ?? shortJobCode(currentJob.id)}</Text><Text style={styles.customer}>{currentJob.order?.customer.name ?? "Customer"}</Text><Text style={styles.address} numberOfLines={1}>📍 {goingToDropoff ? currentJob.dropoffAddress : currentJob.pickupAddress}</Text></View><View style={styles.badges}><View style={styles.badge}><Text style={styles.badgeText}>{goingToDropoff ? "Drop-off" : "Pickup"}</Text></View>{distanceKm != null ? <Text style={styles.distance}>{distanceKm.toFixed(1)} km</Text> : null}</View></View>
      <View style={styles.feeRow}><View><Text style={styles.feeLabel}>COD Amount</Text><Text style={styles.feeValue}>₱{Number(currentJob.order?.quantity ?? 0) > 0 ? Number(currentJob.order?.quantity ?? 0).toFixed(0) : "0.00"}</Text></View><View><Text style={styles.feeLabel}>Delivery Fee</Text><Text style={styles.feeValue}>₱{Number(currentJob.finalFare ?? currentJob.estimatedFare ?? 0).toFixed(2)}</Text></View></View>
      <Pressable disabled={busy || !completeEnabled} style={[styles.action, (!completeEnabled || busy) && styles.disabled]} onPress={() => { const next = JOB_NEXT_STATUS[currentJob.status]; if (next) void advanceJob(currentJob, next); }}><Text style={styles.actionText}>{completeEnabled ? "Complete Delivery" : jobActionLabel(currentJob.status)}</Text></Pressable>
    </View> : null}
    {currentJob && !drawerOpen ? <Pressable onPress={() => setDrawerOpen(true)} style={styles.showDrawer}><View style={styles.handle} /><Text style={styles.showText}>Tap to show delivery</Text></Pressable> : null}
  </SafeAreaView>;
}
function Stat({ value, label }: { value: string; label: string }) { return <View style={styles.statItem}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, topBar: { height: 58, backgroundColor: colors.orange, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg }, back: { width: 38, height: 38, alignItems: "flex-start", justifyContent: "center" }, backText: { color: "#fff", fontSize: 38, lineHeight: 38, fontWeight: "300" }, brandBlock: { alignItems: "center" }, brand: { color: "#fff", fontSize: 14, fontWeight: "800", fontStyle: "italic" }, brandAccent: { color: colors.maroon, fontSize: 16, fontWeight: "900", fontStyle: "italic", marginTop: -2 }, status: { color: "#fff", fontSize: 11, fontWeight: "900" }, statsRow: { flexDirection: "row", backgroundColor: colors.surface, marginHorizontal: spacing.lg, marginTop: -spacing.sm, borderRadius: radius.lg, paddingVertical: spacing.sm, elevation: 3 }, statItem: { flex: 1, alignItems: "center" }, statValue: { fontSize: 15, fontWeight: "900", color: colors.ink }, statLabel: { fontSize: 9, color: colors.muted, marginTop: 2, textAlign: "center" }, mapWrap: { flex: 1, minHeight: 280, margin: spacing.lg, marginBottom: 0, borderRadius: radius.lg, overflow: "hidden" }, drawer: { margin: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }, drawerHandle: { alignItems: "center", paddingBottom: spacing.sm }, handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: colors.line }, swipeHint: { fontSize: 9, color: colors.muted, marginTop: 3 }, drawerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, food: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.orangeSoft, alignItems: "center", justifyContent: "center" }, orderNo: { fontSize: 14, fontWeight: "900", color: colors.ink }, customer: { fontSize: 12, fontWeight: "700", color: colors.body, marginTop: 1 }, address: { fontSize: 11, color: colors.muted, marginTop: 2 }, badges: { alignItems: "flex-end" }, badge: { backgroundColor: colors.orangeSoft, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 }, badgeText: { color: colors.orangeDark, fontSize: 10, fontWeight: "800" }, distance: { fontSize: 10, color: colors.muted, marginTop: 4 }, feeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line }, feeLabel: { fontSize: 10, color: colors.muted, fontWeight: "800", textTransform: "uppercase" }, feeValue: { fontSize: 17, color: colors.ink, fontWeight: "900", marginTop: 2 }, action: { marginTop: spacing.md, backgroundColor: colors.orange, borderRadius: radius.md, paddingVertical: 13, alignItems: "center" }, actionText: { color: "#fff", fontSize: 14, fontWeight: "900" }, disabled: { backgroundColor: colors.line }, showDrawer: { margin: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 10, alignItems: "center" }, showText: { color: colors.muted, fontSize: 11, fontWeight: "800", marginTop: 4 }
});
