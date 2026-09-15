"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Plus, Wifi, WifiOff } from "lucide-react";
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
  const [fraudOrder, setFraudOrder] = useState<Order | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);

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
  }, []);

  const { connected } = useOrdersRealtime({
    onOrderCreated: handleOrderCreated,
    onOrderUpdated: handleOrderUpdated
  });

  useEffect(() => {
    setRole(decodeRole(window.localStorage.getItem("empanada-token")));

    const today = new Date().toISOString().slice(0, 10);
    void Promise.all([
      apiFetch<Order[]>(`/orders?date=${encodeURIComponent(today)}`).catch(() => []),
      apiFetch<any[]>("/fraud/logs?limit=200").catch(() => [])
    ]).then(([nextOrders, nextFraudLogs]) => {
      setOrders(Array.isArray(nextOrders) ? nextOrders : []);
      setFraudLogs(Array.isArray(nextFraudLogs) ? nextFraudLogs : []);
    });
  }, []);

  const canTagFraud = hasPermission(role, "fraud.manage");

  function closeFraudDialog() {
    setFraudOrder(null);
  }

  function handleFraudSuccess() {
    setFraudOrder(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Orders</h1>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {connected ? "Live" : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setManualOrderOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Order
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="Calendar">
            <CalendarDays className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <OrdersView orders={orders} />
      </div>
      <FraudOrderAlerts orders={orders} logs={fraudLogs} />
      {fraudOrder ? <OrderFraudTagDialog order={fraudOrder} onClose={closeFraudDialog} onSuccess={handleFraudSuccess} /> : null}
      {manualOrderOpen && <ManualOrderForm open={manualOrderOpen} onOpenChange={setManualOrderOpen} />}
    </div>
  );
}
