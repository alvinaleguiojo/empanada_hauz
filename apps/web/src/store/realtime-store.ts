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
    set((state) => ({
      events: [{ event, payload, timestamp: new Date().toISOString() }, ...state.events].slice(0, 50),
      notifications:
        event === "notifications.created" && isNotificationPayload(payload)
          ? [
              {
                id: `${payload.type}-${payload.createdAt}`,
                type: payload.type,
                payload: payload.payload,
                createdAt: payload.createdAt,
                read: false
              },
              ...state.notifications
            ].slice(0, 25)
          : state.notifications
    })),
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
