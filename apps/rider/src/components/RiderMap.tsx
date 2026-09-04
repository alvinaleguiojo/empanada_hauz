import { forwardRef, useImperativeHandle, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Coordinate } from "../types";
import { colors } from "../theme";

export type RiderMapHandle = { recenter: () => void };

type Props = {
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  riderLocation: Coordinate | null;
  pickup: Coordinate | null;
  dropoff: Coordinate | null;
  destination: Coordinate | null;
};

export const RiderMap = forwardRef<RiderMapHandle, Props>(function RiderMap(
  { region, riderLocation, pickup, dropoff, destination },
  ref
) {
  const mapRef = useRef<MapView>(null);
  useImperativeHandle(ref, () => ({ recenter: () => mapRef.current?.animateToRegion(region, 400) }), [region]);

  const routePoints = [riderLocation, destination].filter(
    (point): point is Coordinate => !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  );

  return (
    <View style={styles.wrap}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE} initialRegion={region} region={region}>
        {riderLocation ? <Marker coordinate={riderLocation} title="You"><View style={styles.riderMarker} /></Marker> : null}
        {pickup ? <Marker coordinate={pickup} title="Pickup"><View style={styles.pickupMarker}><Text>🏪</Text></View></Marker> : null}
        {dropoff ? <Marker coordinate={dropoff} title="Drop-off"><View style={styles.dropoffMarker}><Text>🏠</Text></View></Marker> : null}
        {routePoints.length > 1 ? <Polyline coordinates={routePoints} strokeColor={colors.orange} strokeWidth={4} lineDashPattern={[10, 8]} /> : null}
      </MapView>
      <Pressable style={styles.recenter} onPress={() => mapRef.current?.animateToRegion(region, 400)}>
        <Text style={styles.recenterText}>◎</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#E8EDF2", overflow: "hidden" },
  recenter: { position: "absolute", right: 12, top: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", elevation: 4 },
  recenterText: { fontSize: 18, color: colors.ink },
  riderMarker: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", borderWidth: 3, borderColor: colors.orange },
  pickupMarker: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.orange },
  dropoffMarker: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.red }
});
