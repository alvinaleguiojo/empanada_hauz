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

  const { connected } = useOrdersRealtime({
    onOrderCreated: handleOrderCreated,
    onOrderUpdated: handleOrderUpdated
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
      <div className="min-h-0 flex-1" onClick={handleKanbanClick}>
        <OrdersView orders={orders} />
      </div>
      <FraudOrderAlerts orders={orders} logs={fraudLogs} />
      {selectedOrder ? createPortal(
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedOrder(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-background shadow-xl">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="font-semibold">Order Details</h2>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => setSelectedOrder(null)} aria-label="Close order details"><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4">
              <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(selectedOrder, null, 2)}</pre>
              {canTagFraud && <Button className="mt-4" variant="danger" onClick={() => setFraudOrder(selectedOrder)}><ShieldAlert className="mr-2 h-4 w-4" /> Tag as Fraud</Button>}
            </div>
          </div>
        </div>, document.body
      ) : null}
      {fraudOrder ? <OrderFraudTagDialog order={fraudOrder} onClose={closeFraudDialog} onSuccess={handleFraudSuccess} /> : null}
      {manualOrderOpen && <ManualOrderForm open={manualOrderOpen} onOpenChange={setManualOrderOpen} />}
    </div>
  );
}
