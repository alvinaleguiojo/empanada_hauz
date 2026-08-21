import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://empanadahauz.com/api";
const TOKEN_KEY = "empanada-rider-token";
export const RIDER_LOCATION_TASK = "empanada-hauz-rider-location";

TaskManager.defineTask(RIDER_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const location = locations?.[0];
  if (!location) return;

  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return;

  const { coords, timestamp } = location;
  try {
    await fetch(`${API_URL}/rider/location`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        latitude: coords.latitude,
        longitude: coords.longitude,
        heading: coords.heading ?? undefined,
        speed: coords.speed ?? undefined,
        accuracy: coords.accuracy ?? undefined,
        altitude: coords.altitude ?? undefined,
        timestamp
      })
    });
  } catch {
    // The next background location update retries automatically.
  }
});

export async function startRiderBackgroundLocation() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") throw new Error("Foreground location permission is required.");

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted") throw new Error("Background location permission is required so dispatch can track you while the rider app is minimized.");

  const started = await Location.hasStartedLocationUpdatesAsync(RIDER_LOCATION_TASK);
  if (started) return;

  await Location.startLocationUpdatesAsync(RIDER_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15000,
    distanceInterval: 25,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
    foregroundService: {
      notificationTitle: "Empanada Hauz Rider is online",
      notificationBody: "Your live location is being shared with dispatch.",
      notificationColor: "#ef6637"
    }
  });
}

export async function stopRiderBackgroundLocation() {
  const started = await Location.hasStartedLocationUpdatesAsync(RIDER_LOCATION_TASK);
  if (started) await Location.stopLocationUpdatesAsync(RIDER_LOCATION_TASK);
}
