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
    onConnected: handleRealtimeConnected,
    onFallbackPoll: refreshOrderData
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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-foreground/45">Manual order entry, workflow tracking, and dispatch readiness.</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl">Orders</h1>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${connected ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}
              title={connected ? "Live order updates are connected" : "Live updates unavailable; checking every 15 seconds"}
            >
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {connected ? "Live" : "Fallback"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-9 gap-2 px-3 text-sm"
            onClick={() => setManualOrderOpen((open) => !open)}
            aria-expanded={manualOrderOpen}
            aria-label={manualOrderOpen ? "Close Order" : "New Order"}
          >
            {manualOrderOpen ? <X size={15} /> : <Plus size={15} />}
            {manualOrderOpen ? "Close" : "New Order"}
          </Button>
          <a href="/calendar">
            <Button type="button" variant="secondary" className="h-9 gap-2 px-3 text-sm">
              <CalendarDays size={16} />
              Calendar
            </Button>
          </a>
        </div>
      </div>

      <ManualOrderForm open={manualOrderOpen} onOpenChange={setManualOrderOpen} />
      <FraudOrderAlerts orders={orders} logs={fraudLogs} />

      <div className="relative" onClickCapture={handleKanbanClick}>
        <OrdersView orders={orders} />
        {canTagFraud && selectedOrder ? (
          <KanbanFraudDrawerAction order={selectedOrder} onTag={() => setFraudOrder(selectedOrder)} />
        ) : null}
      </div>

      {fraudOrder ? (
        <OrderFraudTagDialog
          order={fraudOrder}
          onClose={closeFraudDialog}
          onSuccess={handleFraudSuccess}
        />
      ) : null}
    </div>
  );
}

function KanbanFraudDrawerAction({ order, onTag }: { order: Order; onTag: () => void }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    const findTarget = () => {
      const labels = Array.from(document.querySelectorAll("p"));
      const label = labels.find((element) => element.textContent?.trim() === "Order details");
      const actionRow = label?.parentElement?.children.item(1);
      if (active) setTarget(actionRow instanceof HTMLElement ? actionRow : null);
    };

    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [order?.id]);

  if (!target) return null;

  return createPortal(
    <Button
      type="button"
      variant="ghost"
      className="gap-1.5 px-3 text-red-500 hover:text-red-500"
      onClick={onTag}
      title={`Tag ${order?.customer?.name || "customer"} as fraud`}
    >
      <ShieldAlert size={14} />
      Tag as Fraud
    </Button>,
    target
  );
}
