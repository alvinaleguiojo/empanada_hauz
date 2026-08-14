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
  if (!valid.length) return { latitude: 14.5995, longitude: 120.9842, latitudeDelta: 0.08, longitudeDelta: 0.08 };
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

  return (
    <View style={styles.container}>
      <MapView style={StyleSheet.absoluteFillObject} initialRegion={regionFor(points)} showsUserLocation={Boolean(riderLocation)} showsMyLocationButton={false}>
        {riderLocation ? <Marker coordinate={riderLocation} title="You" pinColor="#ef6637" /> : null}
        {pickup ? <Marker coordinate={pickup} title="Pickup" description={pickupAddress} /> : null}
        {dropoff ? <Marker coordinate={dropoff} title="Drop-off" description={dropoffAddress} /> : null}
        {route.length > 1 ? <Polyline coordinates={route} strokeWidth={5} /> : null}
      </MapView>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Delivery Map</Text>
          <Text style={styles.subtitle}>{pickup ? "Pickup → drop-off" : "Current rider location"}</Text>
        </View>
        {onClose ? <Pressable onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable> : null}
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Route</Text>
        <Text style={styles.legendText}>📍 You  •  🟠 Pickup  •  🔴 Drop-off</Text>
        {dropoffAddress ? <Text style={styles.address}>{dropoffAddress}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#101521" },
  header: { position: "absolute", top: 16, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(15,21,33,0.94)", borderRadius: 16, padding: 14 },
  headerText: { flex: 1 },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  subtitle: { color: "#aab3c2", marginTop: 3 },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#293244", alignItems: "center", justifyContent: "center" },
  closeText: { color: "#fff", fontSize: 26, lineHeight: 28 },
  legend: { position: "absolute", left: 16, right: 16, bottom: 20, backgroundColor: "rgba(15,21,33,0.94)", borderRadius: 16, padding: 14 },
  legendTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  legendText: { color: "#d8dee8", marginTop: 5 },
  address: { color: "#aab3c2", marginTop: 7 }
});
