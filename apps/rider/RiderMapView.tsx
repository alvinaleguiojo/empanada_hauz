import { useEffect, useMemo, useRef, useState } from "react";
import * as ReactNativeMaps from "react-native-maps";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

const MapsModule = ReactNativeMaps as any;
const MapView = MapsModule.default ?? MapsModule;
const Marker = MapsModule.Marker ?? MapView.Marker;
const Polyline = MapsModule.Polyline ?? MapView.Polyline;
const PROVIDER_GOOGLE = MapsModule.PROVIDER_GOOGLE ?? MapView.PROVIDER_GOOGLE;

type Coordinate = { latitude: number; longitude: number };
type Props = { riderLocation?: Coordinate | null; status?: string; pickup?: Coordinate | null; dropoff?: Coordinate | null; pickupAddress?: string; dropoffAddress?: string; onClose?: () => void; simulateNavigation?: boolean };
type NavigationStep = { instruction: string; distanceMeters: number; durationSeconds: number; endLocation: Coordinate; maneuver?: string };
type RouteInfo = { points: Coordinate[]; distance: number; duration: string; durationSeconds: number; originLabel: string; steps: NavigationStep[] };
const valid = (p?: Coordinate | null): p is Coordinate => !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

