"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CalendarDays, Plus, Wifi, WifiOff, X } from "lucide-react";
import { ManualOrderForm } from "@/components/orders/manual-order-form";
import { OrdersView } from "@/components/orders/orders-view";
import { FraudOrderAlerts } from "@/components/orders/fraud-order-alerts";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useOrdersRealtime, type OrderRealtimeEvent } from "@/hooks/use-orders-realtime";

type Order = Record<string, any> & { id: string };

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [fraudLogs, setFraudLogs] = useState<any[]>([]);
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
    const today = new Date().toISOString().slice(0, 10);
    void Promise.all([
      apiFetch<Order[]>(`/orders?date=${encodeURIComponent(today)}`).catch(() => []),
      apiFetch<any[]>("/fraud/logs?limit=200").catch(() => [])
    ]).then(([nextOrders, nextFraudLogs]) => {
      setOrders(Array.isArray(nextOrders) ? nextOrders : []);
      setFraudLogs(Array.isArray(nextFraudLogs) ? nextFraudLogs : []);
    });
  }, []);

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
          <Button asChild variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="Calendar">
            <Link href="/calendar">
              <CalendarDays className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <OrdersView orders={orders} />
      </div>
      <FraudOrderAlerts orders={orders} logs={fraudLogs} />
      {manualOrderOpen ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-6 lg:p-8">
          <button
            type="button"
            aria-label="Close new order form"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setManualOrderOpen(false)}
          />
          <div className="relative z-10 my-auto w-full max-w-6xl rounded-xl bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
              <div>
                <h2 className="text-lg font-semibold">New Order</h2>
                <p className="text-xs text-muted-foreground">Create a manual order</p>
              </div>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => setManualOrderOpen(false)} aria-label="Close new order form">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto p-4 sm:p-6">
              <ManualOrderForm open={manualOrderOpen} onOpenChange={setManualOrderOpen} />
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
