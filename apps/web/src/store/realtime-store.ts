"use client";

import { create } from "zustand";

interface NotificationItem {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
  read: boolean;
}

interface RealtimeState {
  events: Array<{ event: string; payload: unknown; timestamp: string }>;
  notifications: NotificationItem[];
  push: (event: string, payload: unknown) => void;
  markNotificationsRead: () => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  events: [],
  notifications: [],
  push: (event, payload) =>
    set((state) => {
      const notification = createNotificationFromRealtimeEvent(event, payload);

      return {
        events: [{ event, payload, timestamp: new Date().toISOString() }, ...state.events].slice(0, 50),
        notifications: notification
          ? [notification, ...state.notifications.filter((item) => item.id !== notification.id)].slice(0, 25)
          : state.notifications
      };
    }),
  markNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((item) => ({ ...item, read: true }))
    }))
}));

function isNotificationPayload(
  value: unknown
): value is {
  type: string;
  payload: unknown;
  createdAt: string;
} {
  return typeof value === "object" && value !== null && "type" in value && "payload" in value && "createdAt" in value;
}

function createNotificationFromRealtimeEvent(event: string, payload: unknown): NotificationItem | null {
  if (event === "notifications.created" && isNotificationPayload(payload)) {
    return {
      id: getNotificationId(payload.type, payload.payload, payload.createdAt),
      type: payload.type,
      payload: payload.payload,
      createdAt: payload.createdAt,
      read: false
    };
  }

  if (["orders.updated", "kitchen.updated", "batches.updated", "deliveries.updated"].includes(event)) {
    const createdAt = new Date().toISOString();
    return {
      id: getNotificationId(event, payload, createdAt),
      type: event,
      payload,
      createdAt,
      read: false
    };
  }

  return null;
}

function getNotificationId(type: string, payload: unknown, createdAt: string) {
  if (typeof payload === "object" && payload !== null) {
    const value = payload as { id?: unknown; orderId?: unknown; orderNumber?: unknown; updatedAt?: unknown; status?: unknown };
    const entityId = typeof value.orderId === "string" ? value.orderId : typeof value.id === "string" ? value.id : typeof value.orderNumber === "string" ? value.orderNumber : undefined;
    const version = typeof value.updatedAt === "string" ? value.updatedAt : typeof value.status === "string" ? value.status : createdAt;

    if (entityId) {
      return `${type}-${entityId}-${version}`;
    }
  }

  return `${type}-${createdAt}`;
}
