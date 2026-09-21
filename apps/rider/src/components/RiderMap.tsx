import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Coordinate } from "../types";
import { colors } from "../theme";

export type RiderMapHandle = { recenter: () => void };

type Props = {
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  riderLocation: Coordinate | null;
  pickup: Coordinate | null;
  dropoff: Coordinate | null;
  destination: Coordinate | null;
  route?: Coordinate[];
  heading?: number;
  follow?: boolean;
  onUserGesture?: () => void;
};

export const RiderMap = forwardRef<RiderMapHandle, Props>(function RiderMap(
  { region, riderLocation, pickup, dropoff, destination, route = [], heading = 0, follow = true, onUserGesture },
  ref
) {
  const mapRef = useRef<MapView>(null);

  const camera = {
    center: riderLocation ?? destination ?? { latitude: region.latitude, longitude: region.longitude },
    zoom: riderLocation ? 17.4 : 15,
    pitch: riderLocation ? 48 : 0,
    heading: riderLocation ? heading : 0
  };

  const animateToCurrent = (duration = 450) => {
    mapRef.current?.animateCamera(camera, { duration });
  };

  useImperativeHandle(ref, () => ({
    recenter: () => animateToCurrent()
  }), [camera.center.latitude, camera.center.longitude, camera.zoom, camera.pitch, camera.heading]);

  useEffect(() => {
    if (!follow || !riderLocation) return;
    const timer = setTimeout(() => animateToCurrent(350), 0);
    return () => clearTimeout(timer);
  }, [follow, riderLocation?.latitude, riderLocation?.longitude, heading]);

  const fallback = [riderLocation, destination].filter(
    (point): point is Coordinate =>
      !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  );
  const routePoints = route.length > 1 ? route : fallback;

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        onPanDrag={() => onUserGesture?.()}
        showsUserLocation={false}
        rotateEnabled
        pitchEnabled
      >
        {riderLocation ? (
          <Marker coordinate={riderLocation} title="You" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.riderMarker, { transform: [{ rotate: String(heading) + "deg" }] }]}>
              <Text style={styles.motorcycle}>🏍️</Text>
            </View>
          </Marker>
        ) : null}
        {pickup ? (
          <Marker coordinate={pickup} title="Pickup">
            <View style={styles.pickupMarker}><Text>🏪</Text></View>
          </Marker>
        ) : null}
        {dropoff ? (
          <Marker coordinate={dropoff} title="Drop-off">
            <View style={styles.dropoffMarker}><Text>🏠</Text></View>
          </Marker>
        ) : null}
        {routePoints.length > 1 ? (
          <Polyline coordinates={routePoints} strokeColor="#4285F4" strokeWidth={6} />
        ) : null}
      </MapView>

      <Pressable
        style={[styles.recenter, follow && styles.recenterActive]}
        onPress={() => {
          onUserGesture?.();
          animateToCurrent();
        }}
      >
        <Text style={[styles.recenterText, follow && styles.recenterTextActive]}>◎</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#E8EDF2", overflow: "hidden" },
  recenter: { position: "absolute", right: 12, top: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  recenterActive: { borderWidth: 2, borderColor: "#4285F4" },
  recenterText: { fontSize: 20, color: colors.ink },
  recenterTextActive: { color: "#4285F4" },
  riderMarker: { minWidth: 46, height: 46, borderRadius: 23, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#4285F4", elevation: 5 },
  motorcycle: { fontSize: 22 },
  pickupMarker: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.orange },
  dropoffMarker: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.red }
});
