"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, Wifi, WifiOff, X } from "lucide-react";
import { ManualOrderForm } from "@/components/orders/manual-order-form";
import { OrdersView } from "@/components/orders/orders-view";
import { OrdersLoadingSkeleton } from "@/components/orders/orders-loading-skeleton";
import { FraudOrderAlerts } from "@/components/orders/fraud-order-alerts";
import { OrderFraudTagDialog } from "@/components/orders/order-fraud-tag-dialog";
import { OrderFraudTrigger } from "@/components/orders/order-fraud-trigger";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { applyOrderRealtimeEvent, type OrderRealtimeEvent } from "@/lib/order-realtime-adapter";
import { decodeRole, hasPermission, type UserRole } from "@/lib/permissions";
import { useOrdersRealtime } from "@/hooks/use-orders-realtime";

type Order = Record<string, any> & { id: string };

const BUSINESS_TIME_ZONE = "Asia/Manila";

function getBusinessDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function getSelectedOrdersDate() {
  if (typeof document === "undefined") return getBusinessDate();
  const dateInput = document.querySelector<HTMLInputElement>('input[type="date"]');
  return dateInput?.value || getBusinessDate();
}

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
    // OrdersBoard owns the selected-date query. Do not let a realtime event for
    // today's orders replace a historical date that the user is currently viewing.
    const selectedDate = getSelectedOrdersDate();
    const preferredSchedule = typeof order.preferredSchedule === "string" ? order.preferredSchedule.slice(0, 10) : null;
    const createdAt = typeof order.createdAt === "string" ? order.createdAt.slice(0, 10) : null;
    const orderDate = preferredSchedule ?? createdAt;
    if (selectedDate !== getBusinessDate() || orderDate !== selectedDate) return;
    setOrders((current) => applyOrderRealtimeEvent(current, order, "created"));
  }, []);

  const handleOrderUpdated = useCallback((event: OrderRealtimeEvent) => {
    if (!event.id) return;
    // The parent state is the initial/current-day feed. When a historical date
    // is selected, leaving this state untouched prevents the OrdersBoard's
    // prop-sync effect from pushing today's orders back into the selected date.
    if (getSelectedOrdersDate() !== getBusinessDate()) return;
    setOrders((current) => applyOrderRealtimeEvent(current, event, "updated"));
  }, []);

  const { connected } = useOrdersRealtime({ onOrderCreated: handleOrderCreated, onOrderUpdated: handleOrderUpdated });

  useEffect(() => {
    setRole(decodeRole(window.localStorage.getItem("empanada-token")));
    const today = getBusinessDate();
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
    const ariaLabel = button.getAttribute("aria-label") ?? "";

    if (/close order details/i.test(ariaLabel) || /hide details/i.test(text)) {
      setSelectedOrderForFraud(null);
      setFraudDrawerOpen(false);
      return;
    }

    if (!text) return;
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

  const openFraudDrawer = useCallback(() => {
    if (canTagFraud && selectedOrderForFraud) setFraudDrawerOpen(true);
  }, [canTagFraud, selectedOrderForFraud]);

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
      <header className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(8,13,24,0.96),rgba(8,13,24,0.78))] px-4 py-4 backdrop-blur-2xl sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-white">Orders</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${connected ? "border-emerald-300/15 bg-emerald-300/10 text-emerald-200" : "border-rose-300/15 bg-rose-300/10 text-rose-200"}`}>
                {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {connected ? "Live" : "Disconnected"}
              </span>
            </div>
            <p className="mt-1 text-xs text-white/35">Real-time order management, production workflow, and delivery operations.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setManualOrderOpen(true)} disabled={initialLoading} className="h-10 rounded-xl border-white/10 bg-white/[0.04] px-4 hover:bg-white/[0.08]">
              <Plus className="mr-1.5 h-4 w-4" /> New Order
            </Button>
            <Button variant="outline" size="sm" className="h-10 w-10 rounded-xl border-white/10 bg-white/[0.04] p-0 hover:bg-white/[0.08]" aria-label="Calendar" onClick={() => router.push("/calendar")} disabled={initialLoading}>
              <CalendarDays className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto" onClickCapture={handleOrdersClickCapture}>
        {initialLoading ? <OrdersLoadingSkeleton /> : <OrdersView orders={orders} />}
      </div>
      <FraudOrderAlerts orders={orders} logs={fraudLogs} />
      <OrderFraudTrigger visible={Boolean(selectedOrderForFraud && canTagFraud)} onClick={openFraudDrawer} />
      {fraudDrawerOpen && selectedOrderForFraud && canTagFraud ? <OrderFraudTagDialog order={selectedOrderForFraud} onClose={closeFraudDialog} onSuccess={handleFraudSuccess} /> : null}
      {manualOrderOpen ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-6 lg:p-8">
          <button type="button" aria-label="Close new order form" className="absolute inset-0 h-full w-full cursor-default" onClick={() => setManualOrderOpen(false)} />
          <div className="relative z-10 my-auto w-full max-w-6xl overflow-hidden rounded-[22px] border border-white/10 bg-background shadow-[0_30px_100px_-35px_rgba(0,0,0,0.9)]">
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
