import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import * as Speech from "expo-speech";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { RiderMap, RiderMapHandle } from "../components/RiderMap";
import { getRiderRoute } from "../api";
import { RiderSession } from "../hooks/useRiderSession";
import { Coordinate, JOB_NEXT_STATUS, jobActionLabel } from "../types";

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

  const insets = useSafeAreaInsets();

  if (!currentJob) {
    return (
      <>
        <StatusBar style="dark" />
        <View style={styles.emptyScreen}>
          <Text style={styles.emptyIcon}>🧭</Text>
          <Text style={styles.emptyTitle}>No active delivery</Text>
          <Pressable style={styles.action} onPress={onBack}>
            <Text style={styles.actionText}>Back to Rider Home</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <View style={styles.screen}>
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

        <View style={[styles.topOverlay, { paddingTop: insets.top + 10 }]}>
          <Pressable onPress={onBack} hitSlop={10} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>

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
              accessibilityLabel={voice ? "Turn voice guidance off" : "Turn voice guidance on"}
            >
              <Text style={styles.voiceIcon}>{voice ? "🔊" : "🔇"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.mapActions, { top: insets.top + 78 }]}>
          <Pressable
            onPress={handleRecenter}
            style={[styles.circleButton, follow && styles.circleButtonActive]}
            accessibilityLabel="Recenter map"
          >
            <Text style={[styles.circleIcon, follow && styles.circleIconActive]}>◎</Text>
          </Pressable>
          <Pressable
            onPress={() => void calculateRoute(true)}
            style={styles.circleButton}
            accessibilityLabel="Refresh route"
          >
            <Text style={[styles.circleIcon, loading && styles.spinIcon]}>↻</Text>
          </Pressable>
        </View>

        <View style={[styles.drawer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            onPress={() => setDrawerOpen((open) => !open)}
            style={styles.drawerHandle}
            accessibilityRole="button"
            accessibilityLabel={drawerOpen ? "Hide delivery details" : "Show delivery details"}
          >
            <View style={styles.handle} />
          </Pressable>

          {drawerOpen ? (
            <>
              <View style={styles.destinationRow}>
                <View style={styles.info}>
                  <Text style={styles.destinationLabel}>
                    {returningToEmpanadaHauz
                      ? "Return to"
                      : goingToDropoff
                        ? "Deliver to"
                        : "Pickup at"}
                  </Text>
                  <Text style={styles.destinationText}>{destinationText}</Text>
                  {!returningToEmpanadaHauz ? (
                    <Text style={styles.customer}>
                      {currentJob.order?.customer?.name ?? "Customer"}
                    </Text>
                  ) : null}
                  <Text style={styles.address}>📍 {destinationText}</Text>
                  <View style={styles.routeMeta}>
                    <Text style={styles.routeMetaText}>
                      {route ? distanceText(remaining) : "Calculating route…"}
                    </Text>
                    <Text style={styles.routeDot}>•</Text>
                    <Text style={styles.routeMetaText}>
                      {route ? timeText(etaSeconds) : "—"}
                    </Text>
                    <Text style={styles.routeDot}>•</Text>
                    <Text style={styles.routeMetaText}>ETA {arriveTime}</Text>
                  </View>
                </View>

                <View style={styles.destinationIcon}>
                  <Text style={styles.destinationIconText}>➤</Text>
                </View>
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {offRoute ? (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>You are off route. Recalculating…</Text>
                </View>
              ) : null}

              {returningToEmpanadaHauz ? (
                <Text style={styles.returnHint}>
                  The map is routing you from your current location back to Empanada Hauz.
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
                    styles.actionButton,
                    (busy ||
                      !JOB_NEXT_STATUS[currentJob.status] ||
                      (currentJob.status === "delivering" && !canComplete)) &&
                      styles.disabled
                  ]}
                  onPress={() => void handleAdvance()}
                >
                  <Text style={styles.actionButtonText}>
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
            </>
          ) : null}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#E9E6DF", overflow: "hidden" },
  topOverlay: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    zIndex: 20
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  backText: { color: "#111827", fontSize: 34, fontWeight: "300", marginTop: -3 },
  navigationCard: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: 8,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  instructionIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  },
  instructionIconText: { color: "#111827", fontSize: 28, fontWeight: "900" },
  navigationCopy: { flex: 1, minWidth: 0 },
  nextDistance: { color: "#fff", fontSize: 22, fontWeight: "900" },
  instruction: { color: "rgba(255,255,255,.75)", fontSize: 13, fontWeight: "700", marginTop: 1 },
  voiceButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  voiceIcon: { fontSize: 18 },
  mapActions: {
    position: "absolute",
    right: 12,
    gap: 8,
    zIndex: 15
  },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }
  },
  circleButtonActive: { borderWidth: 2, borderColor: "#4285F4" },
  circleIcon: { fontSize: 20, color: "#555" },
  circleIconActive: { color: "#4285F4" },
  spinIcon: { color: "#4285F4" },
  drawer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 6,
    elevation: 14,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -8 },
    zIndex: 25,
    maxHeight: "58%"
  },
  drawerHandle: {
    alignItems: "center",
    paddingVertical: 8
  },
  handle: {
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E5E7EB"
  },
  destinationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingBottom: 2
  },
  info: { flex: 1, minWidth: 0 },
  destinationLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#888"
  },
  destinationText: {
    marginTop: 3,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "900",
    color: "#111827"
  },
  customer: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: "#555"
  },
  address: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: "#666"
  },
  routeMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6
  },
  routeMetaText: { fontSize: 11, color: "#666", fontWeight: "700" },
  routeDot: { fontSize: 10, color: "#999" },
  destinationIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#F7F2EC",
    alignItems: "center",
    justifyContent: "center"
  },
  destinationIconText: { color: "#111827", fontSize: 22, fontWeight: "900" },
  feeCard: {
    marginTop: 14,
    backgroundColor: "#F7F2EC",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  feeLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  feeLineLast: {},
  feeLabel: { fontSize: 13, color: "#756D66", fontWeight: "700" },
  feeValue: { fontSize: 18, color: "#111827", fontWeight: "900" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB"
  },
  totalLabel: { fontSize: 13, color: "#111827", fontWeight: "900" },
  totalValue: { fontSize: 20, color: "#111827", fontWeight: "900" },
  errorBox: {
    marginTop: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  errorText: { fontSize: 12, lineHeight: 17, color: "#B42318", fontWeight: "700" },
  warningBox: {
    marginTop: 10,
    backgroundColor: "#FFFAEB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  warningText: { fontSize: 12, lineHeight: 17, color: "#B54708", fontWeight: "700" },
  returnHint: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 17,
    color: "#666"
  },
  arrivalText: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: "#666",
    textAlign: "center"
  },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  actionButtonText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  callButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center"
  },
  callIcon: { fontSize: 19, color: "#111827" },
  disabled: { opacity: 0.5 },
  emptyScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F7F2EC"
  },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { marginTop: 16, fontSize: 22, fontWeight: "900", color: "#111827" },
  action: {
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: "#F45B25",
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  actionText: { color: "#fff", fontSize: 14, fontWeight: "900" }
});
