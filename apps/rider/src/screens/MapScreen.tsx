import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import * as Speech from "expo-speech";
import { SafeAreaView } from "react-native-safe-area-context";
import { RiderMap, RiderMapHandle } from "../components/RiderMap";
import { getRiderRoute } from "../api";
import { RiderSession } from "../hooks/useRiderSession";
import { colors, radius, shadow, spacing } from "../theme";
import { Coordinate, JOB_NEXT_STATUS, jobActionLabel, shortJobCode } from "../types";

const CEBU_CENTER = { latitude: 10.3157, longitude: 123.8854, latitudeDelta: 0.08, longitudeDelta: 0.08 };
const ARRIVAL_RADIUS_METERS = 50;
const OFF_ROUTE_METERS = 60;
const ROUTE_REFRESH_MS = 5000;

type RouteState = {
  points: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
};

function valid(p?: Coordinate | null): p is Coordinate {
  return !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);
}

function distanceMeters(a: Coordinate, b: Coordinate) {
  const r = 6371000;
  const p1 = a.latitude * Math.PI / 180;
  const p2 = b.latitude * Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLng = (b.longitude - a.longitude) * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
}

function decodePolyline(encoded: string): Coordinate[] {
  const coordinates: Coordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }

  return coordinates;
}

function durationSeconds(duration?: string | number) {
  if (typeof duration === "number") return duration;
  const match = String(duration ?? "").match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return match ? Number(match[1]) : 0;
}

function routeLength(points: Coordinate[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceMeters(points[index - 1], points[index]);
  }
  return total;
}

function nearestAlong(point: Coordinate, line: Coordinate[]) {
  let bestDistance = Infinity;
  let along = 0;
  let bestAlong = 0;

  for (let index = 1; index < line.length; index += 1) {
    const start = line[index - 1];
    const end = line[index];
    const referenceLat = 111320;
    const referenceLng = Math.cos(point.latitude * Math.PI / 180) * referenceLat;
    const ax = (start.longitude - point.longitude) * referenceLng;
    const ay = (start.latitude - point.latitude) * referenceLat;
    const bx = (end.longitude - point.longitude) * referenceLng;
    const by = (end.latitude - point.latitude) * referenceLat;
    const dx = bx - ax;
    const dy = by - ay;
    const denominator = dx * dx + dy * dy;
    const t = denominator ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denominator)) : 0;
    const closest = {
      latitude: start.latitude + (end.latitude - start.latitude) * t,
      longitude: start.longitude + (end.longitude - start.longitude) * t
    };
    const segmentLength = distanceMeters(start, end);
    const currentDistance = distanceMeters(point, closest);

    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      bestAlong = along + segmentLength * t;
    }

    along += segmentLength;
  }

  return { distance: bestDistance, along: bestAlong };
}

function regionFor(points: Coordinate[]) {
  const validPoints = points.filter(valid);
  if (!validPoints.length) return CEBU_CENTER;
  const latitudes = validPoints.map((point) => point.latitude);
  const longitudes = validPoints.map((point) => point.longitude);

  return {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    latitudeDelta: Math.max(0.015, (Math.max(...latitudes) - Math.min(...latitudes)) * 1.6),
    longitudeDelta: Math.max(0.015, (Math.max(...longitudes) - Math.min(...longitudes)) * 1.6)
  };
}

function distanceText(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${Math.max(10, Math.round(value / 10) * 10)} m`;
}

function timeText(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

function money(value?: number | null) {
  return value == null
    ? "—"
    : `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function instructionText() {
  // The shared rider route endpoint currently returns route geometry, distance,
  // and duration but not maneuver steps. Keep the native wording aligned with
  // the existing Web Rider fallback instruction.
  return "Continue straight";
}

export function MapScreen({
  session,
  jobId,
  onBack
}: {
  session: RiderSession;
  jobId?: string | null;
  onBack: () => void;
}) {
  const { rider, activeJobs, liveLocation, liveHeading, busy, advanceJob, token } = session;
  const mapRef = useRef<RiderMapHandle>(null);
  const lastRouteAt = useRef(0);
  const lastSpokenInstruction = useRef("");
  const [route, setRoute] = useState<RouteState | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offRoute, setOffRoute] = useState(false);
  const [follow, setFollow] = useState(true);
  const [voice, setVoice] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);

  const currentJob =
    (jobId ? session.jobs.find((job) => job.id === jobId) : null) ??
    session.currentJob;

  const riderLocation = liveLocation ?? rider?.locations?.[0] ?? null;
  const pickup =
    currentJob &&
    currentJob.pickupLatitude != null &&
    currentJob.pickupLongitude != null
      ? {
          latitude: Number(currentJob.pickupLatitude),
          longitude: Number(currentJob.pickupLongitude)
        }
      : null;
  const dropoff =
    currentJob &&
    currentJob.dropoffLatitude != null &&
    currentJob.dropoffLongitude != null
      ? {
          latitude: Number(currentJob.dropoffLatitude),
          longitude: Number(currentJob.dropoffLongitude)
        }
      : null;

  const goingToDropoff =
    !!currentJob && ["picked_up", "delivering"].includes(currentJob.status);
  const returningToEmpanadaHauz = currentJob?.status === "delivered";
  const destination = returningToEmpanadaHauz
    ? pickup
    : goingToDropoff
      ? dropoff
      : pickup ?? dropoff;

  const region = useMemo(
    () =>
      regionFor(
        [riderLocation, pickup, dropoff].filter(valid) as Coordinate[]
      ),
    [
      riderLocation?.latitude,
      riderLocation?.longitude,
      pickup?.latitude,
      pickup?.longitude,
      dropoff?.latitude,
      dropoff?.longitude
    ]
  );

  const calculateRoute = useCallback(async (force = false) => {
    if (!token || !riderLocation || !destination) return;

    const now = Date.now();
    if (!force && now - lastRouteAt.current < 4000) return;
    lastRouteAt.current = now;

    setLoading(true);
    setError(null);

    try {
      const result = await getRiderRoute(token, riderLocation, destination);
      const points =
        result.polyline
          ? decodePolyline(result.polyline)
          : result.routes?.[0]?.geometry?.coordinates?.map(
              ([longitude, latitude]) => ({ latitude, longitude })
            ) ?? [];

      if (points.length < 2) {
        throw new Error("No drivable route found");
      }

      setRoute({
        points,
        distanceMeters:
          Number(result.distanceMeters ?? result.routes?.[0]?.distance ?? 0) ||
          routeLength(points),
        durationSeconds:
          durationSeconds(result.duration ?? result.routes?.[0]?.duration)
      });
      setOffRoute(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Routing unavailable");
    } finally {
      setLoading(false);
    }
  }, [destination, riderLocation, token]);

  useEffect(() => {
    void calculateRoute(true);
    const timer = setInterval(() => {
      if (follow) void calculateRoute(false);
    }, ROUTE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [
    token,
    riderLocation?.latitude,
    riderLocation?.longitude,
    destination?.latitude,
    destination?.longitude,
    follow
  ]);

  useEffect(() => {
    if (!route || !riderLocation) return;
    const nearest = nearestAlong(riderLocation, route.points);
    setProgress(Math.min(route.distanceMeters, nearest.along));
    const isOffRoute =
      nearest.distance > OFF_ROUTE_METERS &&
      (!destination || distanceMeters(riderLocation, destination) > 40);

    if (isOffRoute && !offRoute) {
      setOffRoute(true);
      void calculateRoute(true);
    }
  }, [
    route,
    riderLocation?.latitude,
    riderLocation?.longitude,
    destination?.latitude,
    destination?.longitude,
    offRoute
  ]);

  const remaining = route
    ? Math.max(0, route.distanceMeters - progress)
    : 0;
  const etaSeconds =
    route && route.distanceMeters > 0
      ? Math.max(
          0,
          (route.durationSeconds * remaining) / route.distanceMeters
        )
      : 0;
  const nextDistance = remaining;
  const instruction = instructionText();

  useEffect(() => {
    if (!voice || !route || nextDistance > 120) return;
    if (lastSpokenInstruction.current === instruction) return;

    lastSpokenInstruction.current = instruction;
    Speech.stop();
    Speech.speak(instruction, {
      language: "en-US",
      rate: 0.96,
      pitch: 1
    });
  }, [voice, route, nextDistance, instruction]);

  useEffect(() => {
    if (!voice) {
      lastSpokenInstruction.current = "";
      Speech.stop();
    }

    return () => {
      Speech.stop();
    };
  }, [voice]);

  const arrived =
    !!riderLocation &&
    !!dropoff &&
    distanceMeters(riderLocation, dropoff) <= ARRIVAL_RADIUS_METERS;
  const canComplete = currentJob?.status === "delivering" && arrived;
  const codAmount = Number(
    currentJob?.order?.paymentMethod === "cod"
      ? currentJob?.order?.totalAmount ?? 0
      : 0
  );
  const deliveryFee = Number(
    currentJob?.order?.deliveryFee ??
      currentJob?.finalFare ??
      currentJob?.estimatedFare ??
      0
  );
  const total = codAmount + deliveryFee;

  const destinationText = currentJob
    ? returningToEmpanadaHauz
      ? currentJob.pickupAddress
      : goingToDropoff
        ? currentJob.dropoffAddress
        : currentJob.pickupAddress
    : "Destination";

  const arriveTime = new Date(
    Date.now() + etaSeconds * 1000
  ).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });

  const handleRecenter = () => {
    setFollow(true);
    requestAnimationFrame(() => mapRef.current?.recenter());
  };

  const handleUserGesture = () => {
    setFollow(false);
  };

  const handleAdvance = async () => {
    if (!currentJob) return;
    const next = JOB_NEXT_STATUS[currentJob.status];
    if (!next) return;

    if (currentJob.status === "delivering" && !canComplete) {
      setError(
        riderLocation
          ? `You must be within ${ARRIVAL_RADIUS_METERS}m of the delivery location before completing the delivery.`
          : "Waiting for your location before completing the delivery."
      );
      return;
    }

    await advanceJob(currentJob, next);
  };

  const callCustomer = async () => {
    const phone = currentJob?.order?.customer?.phoneNumber;
    if (!phone) return;
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      setError("Unable to open the phone dialer.");
    }
  };

  if (!currentJob) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyScreen}>
          <Text style={styles.emptyIcon}>🧭</Text>
          <Text style={styles.emptyTitle}>No active delivery</Text>
          <Pressable style={styles.action} onPress={onBack}>
            <Text style={styles.actionText}>Back to Rider Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>Empanada</Text>
          <Text style={styles.brandAccent}>Hauz</Text>
        </View>
        <Text style={styles.status}>
          {rider?.status === "online" || rider?.status === "busy"
            ? "Online"
            : "Offline"}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <Stat value={String(activeJobs.length)} label="Active Orders" />
        <Stat value={`₱${session.todayEarnings.toFixed(0)}`} label="Today's Earnings" />
        <Stat
          value={`${rider?.rating?.toFixed(1) ?? "5.0"} ⭐`}
          label="Rider Rating"
        />
      </View>

      <View style={styles.mapWrap}>
        <RiderMap
          ref={mapRef}
          region={region}
          riderLocation={riderLocation}
          pickup={pickup}
          dropoff={dropoff}
          destination={destination}
          route={route?.points}
          heading={liveHeading}
          follow={follow}
          onUserGesture={handleUserGesture}
        />

        <View style={styles.navigationCard}>
          <View style={styles.instructionIcon}>
            <Text style={styles.instructionIconText}>↑</Text>
          </View>
          <View style={styles.navigationCopy}>
            <Text style={styles.nextDistance}>
              {route ? distanceText(nextDistance) : "—"}
            </Text>
            <Text style={styles.instruction} numberOfLines={2}>
              {instruction}
            </Text>
          </View>
          <Pressable
            onPress={() => setVoice((value) => !value)}
            style={styles.voiceButton}
          >
            <Text style={styles.voiceIcon}>{voice ? "🔊" : "🔇"}</Text>
          </Pressable>
        </View>

        <View style={styles.mapActions}>
          <Pressable
            onPress={handleRecenter}
            style={[styles.circleButton, follow && styles.circleButtonActive]}
          >
            <Text style={[styles.circleIcon, follow && styles.circleIconActive]}>
              ◎
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void calculateRoute(true)}
            style={styles.circleButton}
          >
            <Text style={[styles.circleIcon, loading && styles.spinIcon]}>
              ↻
            </Text>
          </Pressable>
        </View>
      </View>

      <View
        style={[
          styles.drawer,
          shadow.float,
          !drawerOpen && styles.drawerCollapsed
        ]}
      >
        <Pressable
          onPress={() => setDrawerOpen((open) => !open)}
          style={styles.drawerHandle}
        >
          <View style={styles.handle} />
          <Text style={styles.swipeHint}>
            {drawerOpen ? "Tap to hide delivery" : "Tap to show delivery"}
          </Text>
        </Pressable>

        <View style={drawerOpen ? undefined : styles.collapsedContent}>
          <View style={styles.drawerRow}>
            <View style={styles.food}>
              <Text style={styles.foodText}>🥟</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.orderNo}>
                {returningToEmpanadaHauz
                  ? "Return to Empanada Hauz"
                  : `Order #${currentJob.order?.orderNumber ?? shortJobCode(currentJob.id)}`}
              </Text>
              <Text style={styles.customer}>
                {returningToEmpanadaHauz
                  ? "Back to pickup location"
                  : currentJob.order?.customer?.name ?? "Customer"}
              </Text>
              <Text style={styles.address}>
                📍 {destinationText}
              </Text>
              <View style={styles.routeMeta}>
                <Text style={styles.routeMetaText}>
                  {route ? distanceText(remaining) : "Calculating route…"}
                </Text>
                <Text style={styles.routeDot}>•</Text>
                <Text style={styles.routeMetaText}>
                  {route ? timeText(etaSeconds) : "—"}
                </Text>
                <Text style={styles.routeDot}>•</Text>
                <Text style={styles.routeMetaText}>
                  ETA {arriveTime}
                </Text>
              </View>
            </View>
            <View style={styles.badges}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {returningToEmpanadaHauz
                    ? "Return"
                    : goingToDropoff
                      ? "Drop-off"
                      : "Pickup"}
                </Text>
              </View>
              {currentJob.distanceKm != null && !returningToEmpanadaHauz ? (
                <Text style={styles.distance}>
                  {currentJob.distanceKm.toFixed(1)} km
                </Text>
              ) : null}
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {offRoute ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                You are off route. Recalculating…
              </Text>
            </View>
          ) : null}

          {returningToEmpanadaHauz ? (
            <Text style={styles.returnHint}>
              The map is routing you from your current location back to Empanada
              Hauz.
            </Text>
          ) : (
            <>
              <View style={styles.feeCard}>
                <View style={styles.feeLine}>
                  <Text style={styles.feeLabel}>COD Amount</Text>
                  <Text style={styles.feeValue}>{money(codAmount)}</Text>
                </View>
                <View style={styles.feeLine}>
                  <Text style={styles.feeLabel}>Delivery Fee</Text>
                  <Text style={styles.feeValue}>{money(deliveryFee)}</Text>
                </View>
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{money(total)}</Text>
              </View>
            </>
          )}

          {currentJob.status === "delivering" && !arrived ? (
            <Text style={styles.arrivalText}>
              Complete Delivery will unlock when you arrive at the destination.
            </Text>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              disabled={
                busy ||
                !JOB_NEXT_STATUS[currentJob.status] ||
                (currentJob.status === "delivering" && !canComplete)
              }
              style={[
                styles.action,
                (busy ||
                  !JOB_NEXT_STATUS[currentJob.status] ||
                  (currentJob.status === "delivering" && !canComplete)) &&
                  styles.disabled
              ]}
              onPress={() => void handleAdvance()}
            >
              <Text style={styles.actionText}>
                {currentJob.status === "delivering" && !canComplete
                  ? "Complete Delivery"
                  : jobActionLabel(currentJob.status)}
              </Text>
            </Pressable>

            {currentJob.order?.customer?.phoneNumber ? (
              <Pressable
                style={styles.callButton}
                onPress={() => void callCustomer()}
                accessibilityLabel="Call customer"
              >
                <Text style={styles.callIcon}>☎</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
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
  topBar: {
    height: 58,
    backgroundColor: colors.orange,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg
  },
  back: { width: 38, height: 38, justifyContent: "center" },
  backText: { color: "#fff", fontSize: 38, fontWeight: "300" },
  brandBlock: { alignItems: "center" },
  brand: { color: "#fff", fontSize: 14, fontWeight: "800", fontStyle: "italic" },
  brandAccent: { color: colors.maroon, fontSize: 16, fontWeight: "900", fontStyle: "italic", marginTop: -2 },
  status: { color: "#fff", fontSize: 11, fontWeight: "900" },
  statsRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: -spacing.sm,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    elevation: 3
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 15, fontWeight: "900", color: colors.ink },
  statLabel: { fontSize: 9, color: colors.muted, marginTop: 2, textAlign: "center" },
  mapWrap: { flex: 1, marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.sm, borderRadius: radius.lg, overflow: "hidden", minHeight: 300 },
  navigationCard: {
    position: "absolute",
    left: 10,
    right: 58,
    top: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: spacing.sm,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  instructionIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  instructionIconText: { color: "#111827", fontSize: 28, fontWeight: "900" },
  navigationCopy: { flex: 1, minWidth: 0 },
  nextDistance: { color: "#fff", fontSize: 21, fontWeight: "900" },
  instruction: { color: "rgba(255,255,255,.74)", fontSize: 12, fontWeight: "700", marginTop: 1 },
  voiceButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  voiceIcon: { fontSize: 18 },
  mapActions: { position: "absolute", top: 66, right: 10, gap: 8 },
  circleButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", elevation: 5 },
  circleButtonActive: { borderWidth: 2, borderColor: "#4285F4" },
  circleIcon: { fontSize: 20, color: colors.ink },
  circleIconActive: { color: "#4285F4" },
  spinIcon: { color: colors.orange },
  drawer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    maxHeight: 330
  },
  drawerCollapsed: { maxHeight: 62 },
  drawerHandle: { alignItems: "center", paddingBottom: spacing.sm },
  handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: colors.line },
  swipeHint: { fontSize: 9, color: colors.muted, marginTop: 3 },
  collapsedContent: { display: "none" },
  drawerRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  food: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.orangeSoft, alignItems: "center", justifyContent: "center" },
  foodText: { fontSize: 22 },
  info: { flex: 1, minWidth: 0 },
  orderNo: { fontSize: 14, fontWeight: "900", color: colors.ink },
  customer: { fontSize: 12, fontWeight: "700", color: colors.body, marginTop: 1 },
  address: { fontSize: 11, color: colors.muted, marginTop: 2, lineHeight: 16 },
  routeMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  routeMetaText: { fontSize: 10, color: colors.muted, fontWeight: "700" },
  routeDot: { fontSize: 9, color: colors.muted },
  badges: { alignItems: "flex-end", flexShrink: 0 },
  badge: { backgroundColor: colors.orangeSoft, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: colors.orangeDark, fontSize: 10, fontWeight: "800" },
  distance: { fontSize: 10, color: colors.muted, marginTop: 4 },
  feeCard: { marginTop: spacing.md, backgroundColor: "#F7F2EC", borderRadius: radius.md, padding: spacing.md },
  feeLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  feeLabel: { fontSize: 11, color: colors.muted, fontWeight: "800" },
  feeValue: { fontSize: 17, color: colors.ink, fontWeight: "900" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  totalLabel: { fontSize: 11, color: colors.ink, fontWeight: "900", textTransform: "uppercase" },
  totalValue: { fontSize: 19, color: colors.ink, fontWeight: "900" },
  errorBox: { marginTop: spacing.sm, backgroundColor: "#FEF2F2", borderRadius: radius.md, padding: spacing.sm },
  errorText: { fontSize: 11, lineHeight: 16, color: "#B42318", fontWeight: "700" },
  warningBox: { marginTop: spacing.sm, backgroundColor: "#FFFAEB", borderRadius: radius.md, padding: spacing.sm },
  warningText: { fontSize: 11, lineHeight: 16, color: "#B54708", fontWeight: "700" },
  returnHint: { marginTop: spacing.md, fontSize: 11, color: colors.muted, lineHeight: 16 },
  arrivalText: { fontSize: 11, color: colors.muted, marginTop: spacing.sm, textAlign: "center" },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1, backgroundColor: colors.orange, borderRadius: radius.md, paddingVertical: 13, alignItems: "center" },
  actionText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  callButton: { width: 50, height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  callIcon: { fontSize: 19, color: colors.ink },
  disabled: { backgroundColor: colors.line },
  emptyScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { marginTop: spacing.md, fontSize: 22, fontWeight: "900", color: colors.ink }
});
