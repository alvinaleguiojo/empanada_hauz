import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import RiderTabbedApp from "./RiderTabbedApp";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://empanadahauz.com/api";
const TOKEN_KEY = "empanada-rider-token";
const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

type RiderProfile = { id: string };

async function getRider(token: string) {
  const response = await fetch(`${API_URL}/rider/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Unable to load rider profile");
  return (await response.json()) as RiderProfile;
}

export default function RiderRealtimeApp() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let socket: Socket | null = null;
    let connectedToken: string | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const disconnect = () => {
      socket?.disconnect();
      socket = null;
      connectedToken = null;
    };

    const syncConnection = async () => {
      if (stopped) return;
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) {
        disconnect();
        return;
      }
      if (socket && connectedToken === token) return;
      disconnect();

      try {
        const rider = await getRider(token);
        if (stopped) return;
        connectedToken = token;
        socket = io(`${SOCKET_URL}/ops`, {
          transports: ["websocket", "polling"],
          auth: { token },
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          timeout: 10000
        });
        socket.on("connect", () => socket?.emit("rider.presence", { riderId: rider.id }));
        const refresh = () => setRevision((value) => value + 1);
        socket.on("rider.delivery.assigned", refresh);
        socket.on("rider.delivery.updated", refresh);
        socket.on("rider.status.updated", refresh);
      } catch {
        disconnect();
      }
    };

    void syncConnection();
    timer = setInterval(() => void syncConnection(), 2000);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      disconnect();
    };
  }, []);

  return <RiderTabbedApp key={revision} />;
}
