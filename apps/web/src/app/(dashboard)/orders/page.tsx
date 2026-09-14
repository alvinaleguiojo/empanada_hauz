"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ShieldAlert } from "lucide-react";
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

      <div className="relative" onClickCapture={handleKanbanClick}>
        <OrdersView orders={orders} />

        {canTagFraud && selectedOrder ? (
          <div className="pointer-events-none fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] items-end p-4 sm:p-6">
            <div className="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-xl border border-red-500/25 bg-panel/95 px-4 py-3 shadow-2xl backdrop-blur-md">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-500/70">Customer Risk Action</p>
                <p className="truncate text-sm font-medium text-foreground">{selectedOrder.customer?.name || "Customer"}</p>
              </div>
              <Button type="button" className="h-9 shrink-0 gap-2 bg-red-600 px-3 text-white hover:bg-red-700" onClick={() => setFraudOrder(selectedOrder)}>
                <ShieldAlert size={15} />
                Tag as Fraud
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {fraudOrder ? <OrderFraudTagDialog order={fraudOrder} onClose={closeFraudDialog} /> : null}
    </div>
  );
}
