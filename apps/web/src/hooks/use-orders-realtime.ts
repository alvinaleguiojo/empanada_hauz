import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "@/lib/config";
import { normalizeOrderRealtimeEvent, type OrderRealtimeEvent } from "@/lib/order-realtime-adapter";

export type { OrderRealtimeEvent } from "@/lib/order-realtime-adapter";

type UseOrdersRealtimeOptions = {
  onOrderCreated: (order: OrderRealtimeEvent) => void;
  onOrderUpdated: (order: OrderRealtimeEvent) => void;
};

export function useOrdersRealtime({ onOrderCreated, onOrderUpdated }: UseOrdersRealtimeOptions) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000
    });

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    const handleCreated = (payload: unknown) => {
      const order = normalizeOrderRealtimeEvent(payload);
      if (order) onOrderCreated(order);
    };
    const handleUpdated = (payload: unknown) => {
      const order = normalizeOrderRealtimeEvent(payload);
      if (order) onOrderUpdated(order);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("orders.created", handleCreated);
    socket.on("orders.updated", handleUpdated);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("orders.created", handleCreated);
      socket.off("orders.updated", handleUpdated);
      socket.disconnect();
    };
  }, [onOrderCreated, onOrderUpdated]);

  return { connected };
}
