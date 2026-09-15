import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_URL } from "@/lib/config";

export type OrderRealtimeEvent = {
  id?: string;
  deleted?: boolean;
  note?: unknown;
  [key: string]: unknown;
};

type UseOrdersRealtimeOptions = {
  onOrderCreated: (order: OrderRealtimeEvent) => void;
  onOrderUpdated: (order: OrderRealtimeEvent) => void;
  onConnected?: () => void | Promise<void>;
};

export function useOrdersRealtime({ onOrderCreated, onOrderUpdated, onConnected }: UseOrdersRealtimeOptions) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const connectedCallbackRef = useRef(onConnected);

  useEffect(() => {
    connectedCallbackRef.current = onConnected;
  }, [onConnected]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000
    });

    socketRef.current = socket;

    const handleConnect = () => {
      setConnected(true);
      void connectedCallbackRef.current?.();
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    const handleCreated = (order: OrderRealtimeEvent) => {
      if (order?.id) onOrderCreated(order);
    };

    const handleUpdated = (order: OrderRealtimeEvent) => {
      if (order?.id) onOrderUpdated(order);
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
      socketRef.current = null;
    };
  }, [onOrderCreated, onOrderUpdated]);

  return { connected };
}
