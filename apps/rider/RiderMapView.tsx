import MapView, { Marker, Polyline, Region } from "react-native-maps";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Coordinate = { latitude: number; longitude: number };

type RiderMapViewProps = {
  riderLocation?: Coordinate | null;
  pickup?: Coordinate | null;
  dropoff?: Coordinate | null;
  pickupAddress?: string;
  dropoffAddress?: string;
  onClose?: () => void;
};

function regionFor(points: Coordinate[]): Region {
  const valid = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  if (!valid.length) return { latitude: 10.3157, longitude: 123.8854, latitudeDelta: 0.08, longitudeDelta: 0.08 };
  const latitudes = valid.map((point) => point.latitude);
  const longitudes = valid.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat, 0.015) * 1.7,
    longitudeDelta: Math.max(maxLng - minLng, 0.015) * 1.7
  };
}

export default function RiderMapView({ riderLocation, pickup, dropoff, pickupAddress, dropoffAddress, onClose }: RiderMapViewProps) {
  const points = [riderLocation, pickup, dropoff].filter(Boolean) as Coordinate[];
  const route = [riderLocation, pickup, dropoff].filter(Boolean) as Coordinate[];
  const hasDelivery = Boolean(pickup || dropoff);

  return (
    <View style={styles.container}>
      <MapView style={StyleSheet.absoluteFill} initialRegion={regionFor(points)} showsUserLocation={Boolean(riderLocation)} showsMyLocationButton={false}>
        {riderLocation ? <Marker coordinate={riderLocation} title="You" pinColor="#ff5a1f" /> : null}
        {pickup ? <Marker coordinate={pickup} title="Pickup" description={pickupAddress} pinColor="#ff7a00" /> : null}
        {dropoff ? <Marker coordinate={dropoff} title="Drop-off" description={dropoffAddress} pinColor="#ef3f23" /> : null}
        {route.length > 1 ? <Polyline coordinates={route} strokeColor="#ff5a1f" strokeWidth={5} lineDashPattern={[1]} /> : null}
      </MapView>

      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>EMPANADA HAUZ</Text>
          <Text style={styles.online}>● Online</Text>
        </View>
        {onClose ? <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close map"><Text style={styles.closeText}>×</Text></Pressable> : null}
      </View>

      <View style={styles.stats}>
        <Metric icon="▣" label="Active" value={hasDelivery ? "1" : "0"} />
        <Metric icon="₱" label="Today's Earnings" value="₱320" />
        <Metric icon="★" label="Rider Rating" value="4.9" />
      </View>

      <View style={styles.controls}>
        <View style={styles.control}><Text style={styles.controlText}>➤</Text></View>
        <View style={styles.control}><Text style={styles.controlText}>◎</Text></View>
      </View>

      <View style={styles.routeHint}>
        <Text style={styles.routeIcon}>▣</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.routeTitle}>{hasDelivery ? "Current delivery route" : "Waiting for delivery"}</Text>
          <Text style={styles.routeSubtitle}>{hasDelivery ? "Pickup → Drop-off" : "Your assigned delivery will appear here"}</Text>
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <View style={styles.orderBadge}><Text style={styles.orderBadgeText}>EH</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderTitle}>{hasDelivery ? "Current Order" : "No Active Order"}</Text>
            <Text style={styles.orderSubtitle}>{hasDelivery ? "Ready for pickup and delivery" : "Stay online to receive orders"}</Text>
          </View>
          <View style={styles.statusPill}><Text style={styles.statusText}>{pickup ? "Pickup" : "Online"}</Text></View>
        </View>

        {pickupAddress ? <Stop icon="●" label="PICKUP" address={pickupAddress} /> : null}
        {dropoffAddress ? <Stop icon="⌂" label="DROP-OFF" address={dropoffAddress} /> : null}

        <Pressable style={[styles.navigateButton, !hasDelivery && styles.navigateDisabled]} disabled={!hasDelivery}>
          <Text style={styles.navigateIcon}>➤</Text>
          <Text style={styles.navigateText}>{hasDelivery ? "Navigate to Pickup" : "Waiting for Order"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricIcon}>{icon}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Stop({ icon, label, address }: { icon: string; label: string; address: string }) {
  return <View style={styles.stop}><View style={styles.stopIcon}><Text style={styles.stopIconText}>{icon}</Text></View><View style={{ flex: 1 }}><Text style={styles.stopLabel}>{label}</Text><Text style={styles.stopAddress} numberOfLines={2}>{address}</Text></View></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f2e9" },
  topBar: { position: "absolute", top: 14, left: 14, right: 14, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: "rgba(255,255,255,0.96)", flexDirection: "row", justifyContent: "space-between", alignItems: "center", elevation: 7, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  brand: { color: "#3b1c12", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },
  online: { color: "#16834a", fontWeight: "800", marginTop: 2, fontSize: 12 },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#ff5a1f", alignItems: "center", justifyContent: "center" },
  closeText: { color: "#fff", fontSize: 27, lineHeight: 29, fontWeight: "500" },
  stats: { position: "absolute", top: 86, left: 14, right: 14, flexDirection: "row", backgroundColor: "rgba(255,255,255,0.96)", borderRadius: 20, paddingVertical: 12, elevation: 5, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  metric: { flex: 1, alignItems: "center", borderRightWidth: 1, borderRightColor: "#eee7dc" },
  metricIcon: { color: "#ff5a1f", fontWeight: "900", fontSize: 16 },
  metricValue: { color: "#261711", fontWeight: "900", fontSize: 18, marginTop: 2 },
  metricLabel: { color: "#766d66", fontSize: 9, marginTop: 2, textAlign: "center" },
  controls: { position: "absolute", right: 16, top: 225, gap: 10 },
  control: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: "#000", shadowOpacity: 0.13, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  controlText: { color: "#ff5a1f", fontSize: 24, fontWeight: "800" },
  routeHint: { position: "absolute", left: 16, right: 84, top: 220, backgroundColor: "rgba(255,255,255,0.96)", borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", elevation: 4 },
  routeIcon: { color: "#ff5a1f", fontSize: 24, marginRight: 10 },
  routeTitle: { color: "#2d1b15", fontWeight: "900", fontSize: 14 },
  routeSubtitle: { color: "#766d66", fontSize: 11, marginTop: 2 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#fffaf3", borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 18, paddingBottom: 28, elevation: 12, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: -4 } },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: "#e5ddd2", alignSelf: "center", marginBottom: 14 },
  sheetHeader: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  orderBadge: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#ff5a1f", alignItems: "center", justifyContent: "center", marginRight: 11 },
  orderBadgeText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  orderTitle: { color: "#2b1811", fontWeight: "900", fontSize: 17 },
  orderSubtitle: { color: "#7b716a", fontSize: 11, marginTop: 3 },
  statusPill: { backgroundColor: "#fff0e8", paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14 },
  statusText: { color: "#ef5520", fontWeight: "900", fontSize: 11 },
  stop: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "#f0e8de", borderRadius: 15, padding: 11, marginBottom: 8 },
  stopIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#fff0e8", alignItems: "center", justifyContent: "center", marginRight: 10 },
  stopIconText: { color: "#ff5a1f", fontWeight: "900" },
  stopLabel: { color: "#a09288", fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  stopAddress: { color: "#342018", fontWeight: "700", fontSize: 13, marginTop: 2 },
  navigateButton: { height: 56, borderRadius: 18, backgroundColor: "#ff5a1f", alignItems: "center", justifyContent: "center", flexDirection: "row", marginTop: 6 },
  navigateDisabled: { backgroundColor: "#c8c1ba" },
  navigateIcon: { color: "#fff", fontSize: 20, marginRight: 9 },
  navigateText: { color: "#fff", fontWeight: "900", fontSize: 16 }
});
