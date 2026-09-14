"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ShieldAlert, X } from "lucide-react";
import { ManualOrderForm } from "@/components/orders/manual-order-form";
import { OrdersView } from "@/components/orders/orders-view";
import { FraudOrderAlerts } from "@/components/orders/fraud-order-alerts";
import { OrderFraudTagDialog } from "@/components/orders/order-fraud-tag-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { decodeRole, hasPermission, type UserRole } from "@/lib/permissions";

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [fraudLogs, setFraudLogs] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [fraudOrder, setFraudOrder] = useState<any | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    setRole(decodeRole(window.localStorage.getItem("empanada-token")));
    const today = new Date().toISOString().slice(0, 10);
    void Promise.all([
      apiFetch<any[]>(`/orders?date=${encodeURIComponent(today)}`).catch(() => []),
      apiFetch<any[]>("/fraud/logs?limit=200").catch(() => [])
    ]).then(([nextOrders, nextFraudLogs]) => {
      setOrders(Array.isArray(nextOrders) ? nextOrders : []);
      setFraudLogs(Array.isArray(nextFraudLogs) ? nextFraudLogs : []);
    });
  }, []);

  const canTagFraud = hasPermission(role, "fraud.manage");

  function handleKanbanClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!canTagFraud) return;
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;

    const text = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text || /fraud|edit|save|delete|copy|track|hide details|calendar/i.test(text)) return;

    const match = orders.find((order) => {
      const orderNumber = String(order.orderNumber ?? "").trim();
      const customerName = String(order.customer?.name ?? "").trim();
      return (orderNumber && text.includes(orderNumber)) || (customerName && text.includes(customerName));
    });

    if (match) setSelectedOrder(match);
  }

  function closeFraudDialog() {
    setFraudOrder(null);
    setSelectedOrder(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-foreground/45">Manual order entry, workflow tracking, and dispatch readiness.</p>
          <h1 className="text-2xl font-semibold sm:text-3xl">Orders</h1>
        </div>
        <a href="/calendar">
          <Button type="button" variant="secondary" className="gap-2">
            <CalendarDays size={16} />
            Calendar
          </Button>
        </a>
      </div>

      <ManualOrderForm />
      <FraudOrderAlerts orders={orders} logs={fraudLogs} />

      {canTagFraud && selectedOrder ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-500/70">Selected Kanban Order</p>
            <p className="truncate text-sm font-medium">{selectedOrder.customer?.name || "Customer"} · {selectedOrder.orderNumber || selectedOrder.id}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" className="h-9 gap-2 bg-red-600 px-3 text-white hover:bg-red-700" onClick={() => setFraudOrder(selectedOrder)}>
              <ShieldAlert size={15} />
              Tag as Fraud
            </Button>
            <Button type="button" variant="ghost" className="h-9 w-9 p-0" onClick={() => setSelectedOrder(null)} aria-label="Clear selected order">
              <X size={16} />
            </Button>
          </div>
        </div>
      ) : null}

      <div onClickCapture={handleKanbanClick}>
        <OrdersView orders={orders} />
      </div>

      {fraudOrder ? <OrderFraudTagDialog order={fraudOrder} onClose={closeFraudDialog} /> : null}
    </div>
  );
}
