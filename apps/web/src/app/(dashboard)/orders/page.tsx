"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, ShieldAlert, Wifi, WifiOff, X } from "lucide-react";
import { ManualOrderForm } from "@/components/orders/manual-order-form";
import { OrdersView } from "@/components/orders/orders-view";
import { OrdersLoadingSkeleton } from "@/components/orders/orders-loading-skeleton";
import { FraudOrderAlerts } from "@/components/orders/fraud-order-alerts";
import { OrderFraudTagDialog } from "@/components/orders/order-fraud-tag-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { applyOrderRealtimeEvent, type OrderRealtimeEvent } from "@/lib/order-realtime-adapter";
import { decodeRole, hasPermission, type UserRole } from "@/lib/permissions";
import { useOrdersRealtime } from "@/hooks/use-orders-realtime";

type Order = Record<string, any> & { id: string };

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [fraudLogs, setFraudLogs] = useState<any[]>([]);
  const [selectedOrderForFraud, setSelectedOrderForFraud] = useState<Order | null>(null);
  const [fraudDrawerOpen, setFraudDrawerOpen] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const canTagFraud = hasPermission(role, "fraud.manage");

  const handleOrderCreated = useCallback((order: OrderRealtimeEvent) => {
    const today = new Date().toISOString().slice(0, 10);
    const preferredSchedule = typeof order.preferredSchedule === "string" ? order.preferredSchedule.slice(0, 10) : null;
    const createdAt = typeof order.createdAt === "string" ? order.createdAt.slice(0, 10) : null;
    if (preferredSchedule !== today && (!preferredSchedule && createdAt !== today)) return;
    setOrders((current) => applyOrderRealtimeEvent(current, order, "created"));
  }, []);

  const handleOrderUpdated = useCallback((event: OrderRealtimeEvent) => {
    if (!event.id) return;
    setOrders((current) => applyOrderRealtimeEvent(current, event, "updated"));
  }, []);

  const { connected } = useOrdersRealtime({ onOrderCreated: handleOrderCreated, onOrderUpdated: handleOrderUpdated });

  useEffect(() => {
    setRole(decodeRole(window.localStorage.getItem("empanada-token")));
    const today = new Date().toISOString().slice(0, 10);
    void Promise.all([
      apiFetch<Order[]>(`/orders?date=${encodeURIComponent(today)}`).catch(() => []),
      apiFetch<any[]>("/fraud/logs?limit=200").catch(() => [])
    ]).then(([nextOrders, nextFraudLogs]) => {
      setOrders(Array.isArray(nextOrders) ? nextOrders : []);
      setFraudLogs(Array.isArray(nextFraudLogs) ? nextFraudLogs : []);
    }).finally(() => setInitialLoading(false));
  }, []);

  function handleOrdersClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!canTagFraud) return;
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;

    const text = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text) return;

    if (/hide details/i.test(text)) {
      setSelectedOrderForFraud(null);
      setFraudDrawerOpen(false);
      return;
    }

    if (/fraud|edit|save|delete|copy|track|calendar|new order|add note|create delivery job|assign|reassign/i.test(text)) return;

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

    if (match) {
      setSelectedOrderForFraud(match);
      setFraudDrawerOpen(false);
    }
  }

  function closeFraudDialog() {
    setFraudDrawerOpen(false);
  }

  function handleFraudSuccess() {
    setFraudDrawerOpen(false);
    setSelectedOrderForFraud(null);
    window.location.reload();
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
          <Button variant="outline" size="sm" onClick={() => setManualOrderOpen(true)} disabled={initialLoading}>
            <Plus className="mr-1 h-4 w-4" /> New Order
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="Calendar" onClick={() => router.push("/calendar")} disabled={initialLoading}>
            <CalendarDays className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" onClickCapture={handleOrdersClickCapture}>
        {initialLoading ? <OrdersLoadingSkeleton /> : <OrdersView orders={orders} />}
      </div>
      <FraudOrderAlerts orders={orders} logs={fraudLogs} />
      {selectedOrderForFraud && canTagFraud ? <Button type="button" className="fixed right-7 top-[118px] z-[55] gap-2 bg-red-600 text-white shadow-lg hover:bg-red-700" onClick={() => setFraudDrawerOpen(true)} aria-label="Open fraud drawer">
        <ShieldAlert className="h-4 w-4" /> Fraud
      </Button> : null}
      {fraudDrawerOpen && selectedOrderForFraud && canTagFraud ? <OrderFraudTagDialog order={selectedOrderForFraud} onClose={closeFraudDialog} onSuccess={handleFraudSuccess} /> : null}
      {manualOrderOpen ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-6 lg:p-8">
          <button type="button" aria-label="Close new order form" className="absolute inset-0 h-full w-full cursor-default" onClick={() => setManualOrderOpen(false)} />
          <div className="relative z-10 my-auto w-full max-w-6xl rounded-xl bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
              <div><h2 className="text-lg font-semibold">New Order</h2><p className="text-xs text-muted-foreground">Create a manual order</p></div>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => setManualOrderOpen(false)} aria-label="Close new order form"><X className="h-4 w-4" /></Button>
            </div>
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto p-4 sm:p-6"><ManualOrderForm open={manualOrderOpen} onOpenChange={setManualOrderOpen} /></div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
