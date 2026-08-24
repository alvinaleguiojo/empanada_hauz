import { useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { RiderSession } from "../hooks/useRiderSession";
import { colors, radius, shadow, spacing } from "../theme";
import { Coordinate, JOB_NEXT_STATUS, jobActionLabel, shortJobCode } from "../types";

const CEBU_CENTER = { latitude: 10.3157, longitude: 123.8854, latitudeDelta: 0.08, longitudeDelta: 0.08 };

function valid(point?: Coordinate | null): point is Coordinate {
  return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

function regionFor(points: Coordinate[]) {
  const valids = points.filter(valid);
  if (!valids.length) return CEBU_CENTER;
  const lats = valids.map((p) => p.latitude);
  const lngs = valids.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.015, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.015, (maxLng - minLng) * 1.6)
  };
}

export function MapScreen({ session }: { session: RiderSession }) {
  const { rider, activeJobs, currentJob, liveLocation, busy, advanceJob } = session;
  const mapRef = useRef<MapView>(null);

  const riderLocation = liveLocation ?? rider?.locations?.[0] ?? null;
  const pickup = currentJob && Number.isFinite(currentJob.pickupLatitude) && Number.isFinite(currentJob.pickupLongitude)
    ? { latitude: currentJob.pickupLatitude as number, longitude: currentJob.pickupLongitude as number }
    : null;
  const dropoff = currentJob && Number.isFinite(currentJob.dropoffLatitude) && Number.isFinite(currentJob.dropoffLongitude)
    ? { latitude: currentJob.dropoffLatitude as number, longitude: currentJob.dropoffLongitude as number }
    : null;

  const goingToDropoff = currentJob ? ["picked_up", "delivering"].includes(currentJob.status) : false;
  const destination = goingToDropoff ? dropoff : pickup ?? dropoff;
  const routePoints = useMemo(
    () => [riderLocation, destination].filter(valid) as Coordinate[],
    [riderLocation?.latitude, riderLocation?.longitude, destination?.latitude, destination?.longitude]
  );
  const region = useMemo(
    () => regionFor([riderLocation, pickup, dropoff].filter(valid) as Coordinate[]),
    [riderLocation?.latitude, riderLocation?.longitude, pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude]
  );

  const distanceKm = currentJob?.distanceKm ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerWrap}>
        <View style={styles.headerRow}>
          <Text style={styles.menu}>≡</Text>
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>Empanada</Text>
            <Text style={styles.brandAccent}>Hauz</Text>
          </View>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={{ fontSize: 16 }}>🧑‍✈️</Text>
            </View>
            <View style={styles.onlineDot} />
          </View>
        </View>
        <View style={styles.onlinePill}>
          <Text style={styles.onlinePillText}>{rider?.status === "online" ? "Online" : "Offline"}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Stat value={String(activeJobs.length)} label="Active Orders" />
        <Stat value={rider ? `₱${session.todayEarnings.toFixed(0)}` : "₱0"} label="Today's Earnings" />
        <Stat value={rider ? rider.rating.toFixed(1) + " ⭐" : "5.0 ⭐"} label="Rider Rating" />
      </View>

      {currentJob ? (
        <View style={[styles.currentOrderCard, shadow.card]}>
          <View style={styles.currentOrderTop}>
            <View style={styles.numberBadge}>
              <Text style={styles.numberBadgeText}>1</Text>
            </View>
            <Text style={styles.currentOrderLabel}>Current Order</Text>
            <View style={styles.pickupBadge}>
              <Text style={styles.pickupBadgeText}>{goingToDropoff ? "Drop-off" : "Pickup"}</Text>
            </View>
          </View>
          <View style={styles.currentOrderBody}>
            <View style={{ flex: 1 }}>
              <Text style={styles.currentOrderTitle}>{goingToDropoff ? "Customer" : "Empanada Hauz – Main Branch"}</Text>
              <Text style={styles.currentOrderAddress} numberOfLines={1}>
                📍 {goingToDropoff ? currentJob.dropoffAddress : currentJob.pickupAddress}
              </Text>
            </View>
            <Text style={styles.currentOrderFare}>
              ₱{Number(currentJob.finalFare ?? currentJob.estimatedFare ?? 0).toFixed(0)}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          initialRegion={region}
          region={region}
        >
          {valid(riderLocation) ? (
            <Marker coordinate={riderLocation} title="You">
              <View style={styles.riderMarker} />
            </Marker>
          ) : null}
          {valid(pickup) ? (
            <Marker coordinate={pickup} title="Pickup">
              <View style={styles.pickupMarker}>
                <Text style={styles.markerGlyph}>🏪</Text>
              </View>
            </Marker>
          ) : null}
          {valid(dropoff) ? (
            <Marker coordinate={dropoff} title="Drop-off">
              <View style={styles.dropoffMarker}>
                <Text style={styles.markerGlyph}>🏠</Text>
              </View>
            </Marker>
          ) : null}
          {routePoints.length > 1 ? (
            <Polyline coordinates={routePoints} strokeColor={colors.orange} strokeWidth={4} lineDashPattern={[10, 8]} />
          ) : null}
        </MapView>

        <Pressable style={styles.recenterButton} onPress={() => mapRef.current?.animateToRegion(region, 400)}>
          <Text style={styles.recenterIcon}>◎</Text>
        </Pressable>
      </View>

      {currentJob ? (
        <View style={[styles.bottomCard, shadow.float]}>
          <View style={styles.bottomRow}>
            <View style={styles.bottomFood}>
              <Text style={{ fontSize: 22 }}>🥟</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bottomOrderNo}>Order #{currentJob.order?.orderNumber ?? shortJobCode(currentJob.id)}</Text>
              <Text style={styles.bottomCustomer}>{currentJob.order?.customer.name ?? "Customer"}</Text>
              <Text style={styles.bottomAddress} numberOfLines={1}>
                📍 {goingToDropoff ? currentJob.dropoffAddress : currentJob.pickupAddress}
              </Text>
            </View>
            <View style={styles.bottomBadges}>
              <View style={styles.bottomBadge}>
                <Text style={styles.bottomBadgeText}>{goingToDropoff ? "Drop-off" : "Pickup"}</Text>
              </View>
              {distanceKm != null ? (
                <View style={styles.distanceChip}>
                  <Text style={styles.distanceChipText}>🚗 {distanceKm.toFixed(1)} km</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Pressable
            disabled={busy}
            style={[styles.navigateButton, busy && { opacity: 0.6 }]}
            onPress={() => {
              const next = JOB_NEXT_STATUS[currentJob.status];
              if (next) void advanceJob(currentJob, next);
            }}
          >
            <Text style={styles.navigateButtonText}>➤ {jobActionLabel(currentJob.status)}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.bottomCard, shadow.float]}>
          <Text style={styles.emptyMapText}>No active delivery right now. Go online to receive orders.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  headerWrap: {
    backgroundColor: colors.orange,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  menu: { color: "#fff", fontSize: 24 },
  brandBlock: { alignItems: "center" },
  brand: { color: "#fff", fontSize: 15, fontWeight: "800", fontStyle: "italic", lineHeight: 16 },
  brandAccent: { color: colors.maroon, fontSize: 17, fontWeight: "900", fontStyle: "italic", lineHeight: 18 },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center"
  },
  onlineDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.green,
    borderWidth: 1.5,
    borderColor: colors.orange
  },
  onlinePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: spacing.sm
  },
  onlinePillText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  statsRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: -spacing.md,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    elevation: 3,
    shadowColor: "#3B1D0F",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 17, fontWeight: "900", color: colors.ink },
  statLabel: { fontSize: 10, color: colors.muted, marginTop: 2, textAlign: "center" },
  currentOrderCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md
  },
  currentOrderTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  numberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center"
  },
  numberBadgeText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  currentOrderLabel: { flex: 1, fontWeight: "900", color: colors.ink, fontSize: 13 },
  pickupBadge: { backgroundColor: colors.ink, borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 4 },
  pickupBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  currentOrderBody: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm },
  currentOrderTitle: { fontWeight: "800", color: colors.ink, fontSize: 13 },
  currentOrderAddress: { color: colors.muted, fontSize: 12, marginTop: 2 },
  currentOrderFare: { fontWeight: "900", color: colors.ink, fontSize: 15 },
  mapWrap: { flex: 1, marginTop: spacing.md, marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: "hidden" },
  recenterButton: {
    position: "absolute",
    right: spacing.sm,
    top: spacing.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4
  },
  recenterIcon: { fontSize: 18, color: colors.ink },
  riderMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    borderWidth: 3,
    borderColor: colors.orange
  },
  pickupMarker: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.orange
  },
  dropoffMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.red
  },
  markerGlyph: { fontSize: 16 },
  bottomCard: {
    margin: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md
  },
  bottomRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  bottomFood: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.orangeSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  bottomOrderNo: { fontWeight: "900", color: colors.ink, fontSize: 14 },
  bottomCustomer: { fontWeight: "700", color: colors.body, fontSize: 12, marginTop: 1 },
  bottomAddress: { color: colors.muted, fontSize: 11, marginTop: 2 },
  bottomBadges: { alignItems: "flex-end", gap: 4 },
  bottomBadge: { backgroundColor: colors.orangeSoft, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  bottomBadgeText: { color: colors.orangeDark, fontSize: 10, fontWeight: "800" },
  distanceChip: { backgroundColor: colors.cream, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  distanceChipText: { fontSize: 10, fontWeight: "700", color: colors.body },
  navigateButton: {
    marginTop: spacing.md,
    backgroundColor: colors.orange,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 5,
    alignItems: "center"
  },
  navigateButtonText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  emptyMapText: { textAlign: "center", color: colors.muted, fontSize: 13, paddingVertical: spacing.sm }
});
