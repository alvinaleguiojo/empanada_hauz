"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Plus, ShieldAlert, Wifi, WifiOff, X } from "lucide-react";
import { ManualOrderForm } from "@/components/orders/manual-order-form";
import { OrdersView } from "@/components/orders/orders-view";
import { FraudOrderAlerts } from "@/components/orders/fraud-order-alerts";
import { OrderFraudTagDialog } from "@/components/orders/order-fraud-tag-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { decodeRole, hasPermission, type UserRole } from "@/lib/permissions";
import { useOrdersRealtime, type OrderRealtimeEvent } from "@/hooks/use-orders-realtime";

type Order = Record<string, any> & { id: string };

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [fraudLogs, setFraudLogs] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [fraudOrder, setFraudOrder] = useState<Order | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);

  const refreshOrderData = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [nextOrders, nextFraudLogs] = await Promise.all([
      apiFetch<Order[]>(`/orders?date=${encodeURIComponent(today)}`).catch(() => []),
      apiFetch<any[]>("/fraud/logs?limit=200").catch(() => [])
    ]);

    const normalizedOrders: Order[] = Array.isArray(nextOrders) ? nextOrders : [];
    setOrders(normalizedOrders);
    setFraudLogs(Array.isArray(nextFraudLogs) ? nextFraudLogs : []);

    setSelectedOrder((current: Order | null) => {
      if (!current) return current;
      return normalizedOrders.find((order) => order.id === current.id) ?? current;
    });
  }, []);

  const handleOrderCreated = useCallback((order: OrderRealtimeEvent) => {
    const today = new Date().toISOString().slice(0, 10);
    const preferredSchedule = typeof order.preferredSchedule === "string" ? order.preferredSchedule.slice(0, 10) : null;
    const createdAt = typeof order.createdAt === "string" ? order.createdAt.slice(0, 10) : null;

    if (preferredSchedule !== today && (!preferredSchedule && createdAt !== today)) return;

    setOrders((current: Order[]) => {
      const index = current.findIndex((item) => item.id === order.id);
      if (index >= 0) {
        const next = [...current];
        next[index] = { ...next[index], ...order };
        return next;
      }
      return [order as Order, ...current];
    });
  }, []);

  const handleOrderUpdated = useCallback((event: OrderRealtimeEvent) => {
    if (!event.id) return;

    setOrders((current: Order[]) => {
      if (event.deleted) return current.filter((item) => item.id !== event.id);

      const index = current.findIndex((item) => item.id === event.id);
      if (index < 0) return current;

      const next = [...current];
      next[index] = { ...next[index], ...event };
      return next;
    });

    setSelectedOrder((current: Order | null) => {
      if (!current || current.id !== event.id || event.deleted) return event.deleted ? null : current;
      return { ...current, ...event };
    });
  }, []);

  const handleRealtimeConnected = useCallback(async () => {
    await refreshOrderData();
  }, [refreshOrderData]);

  const { connected } = useOrdersRealtime({
    onOrderCreated: handleOrderCreated,
    onOrderUpdated: handleOrderUpdated,
    onConnected: handleRealtimeConnected
  });

  useEffect(() => {
    setRole(decodeRole(window.localStorage.getItem("empanada-token")));
    void refreshOrderData();
  }, [refreshOrderData]);

  const canTagFraud = hasPermission(role, "fraud.manage");

  function handleKanbanClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!canTagFraud) return;
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;

    const text = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text || /fraud|edit|save|delete|copy|track|hide details|calendar/i.test(text)) return;

    const orderedMatches = orders.filter((order) => {
      const orderNumber = String(order.orderNumber ?? "").trim();
      return orderNumber && text.includes(orderNumber);
    });

    const match = orderedMatches[0] ?? (() => {
      const namedMatches = orders.filter((order) => {
        const customerName = String(order.customer?.name ?? "").trim();
        return customerName && text.includes(customerName);
      });
      return namedMatches.length === 1 ? namedMatches[0] : null;
    })();

    if (match) setSelectedOrder(match);
  }

  function closeFraudDialog() {
    setFraudOrder(null);
  }

  function handleFraudSuccess() {
    setFraudOrder(null);
    void refreshOrderData();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Existing Orders page UI remains unchanged. */}
    </div>
  );
}
