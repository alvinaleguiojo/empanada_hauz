"use client";

import { io } from "socket.io-client";
import { SOCKET_URL } from "./config";

// Keep the shared realtime connection alive so notifications (including
// Messenger webhook events) can reach every mounted dashboard component.
export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000
});

socket.on("connect", () => {
  console.info("[Realtime] Socket.IO connected:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.warn("[Realtime] Socket.IO disconnected:", reason);
});

socket.on("connect_error", (error) => {
  console.warn("[Realtime] Socket.IO connection error:", error.message);
});

// Status changes arrive through the same `orders.updated` channel as normal
// order edits. The notification speech formatter treats `quantity` as an
// order-creation cue, so keep quantity out of status-update payloads before
// the rest of the dashboard receives the event. This prevents a move such as
// queued -> completed from being announced as "ordered 10 pcs".
socket.onAny((event, payload) => {
  if (event !== "orders.updated" || !isObject(payload) || typeof payload.status !== "string") {
    return;
  }

  if (typeof payload.quantity === "number") {
    delete payload.quantity;
  }
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
