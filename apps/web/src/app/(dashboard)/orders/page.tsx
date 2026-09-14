"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Plus, X } from "lucide-react";
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
  const [role, setRole] = useState<UserRole | null>(null);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);

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

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-foreground/45">Manual order entry, workflow tracking, and dispatch readiness.</p>
          <h1 className="text-2xl font-semibold sm:text-3xl">Orders</h1>
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

      <div onClick={handleKanbanClick}>
        <OrdersView orders={orders} />
      </div>

      {typeof document !== "undefined" && selectedOrder
        ? createPortal(
            <OrderFraudTagDialog order={selectedOrder} onClose={() => setSelectedOrder(null)} />,
            document.body
          )
        : null}
    </div>
  );
}
