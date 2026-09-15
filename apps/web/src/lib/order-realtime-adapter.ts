export type OrderRealtimeEvent = {
  id?: string;
  deleted?: boolean;
  [key: string]: unknown;
};

export type OrderRealtimeHandlers = {
  onCreated?: (order: OrderRealtimeEvent) => void;
  onUpdated?: (order: OrderRealtimeEvent) => void;
};

export function normalizeOrderRealtimeEvent(payload: unknown): OrderRealtimeEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const event = payload as Record<string, unknown>;
  return typeof event.id === "string" && event.id ? (event as OrderRealtimeEvent) : null;
}

export function applyOrderRealtimeEvent<T extends { id: string }>(
  orders: T[],
  payload: unknown,
  type: "created" | "updated"
): T[] {
  const event = normalizeOrderRealtimeEvent(payload);
  if (!event?.id) return orders;

  if (type === "updated" && event.deleted) {
    return orders.filter((order) => order.id !== event.id);
  }

  const index = orders.findIndex((order) => order.id === event.id);
  if (index >= 0) {
    const next = orders.slice();
    next[index] = { ...next[index], ...event } as T;
    return next;
  }

  return type === "created" ? [event as T, ...orders] : orders;
}
