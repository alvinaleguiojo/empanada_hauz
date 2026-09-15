"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Plus, X } from "lucide-react";
import { ManualOrderForm } from "@/components/orders/manual-order-form";
import { OrdersView } from "@/components/orders/orders-view";
import { FraudOrderAlerts } from "@/components/orders/fraud-order-alerts";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [fraudLogs, setFraudLogs] = useState<any[]>([]);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    void Promise.all([
      apiFetch<any[]>(`/orders?date=${encodeURIComponent(today)}`).catch(() => []),
      apiFetch<any[]>("/fraud/logs?limit=200").catch(() => [])
    ]).then(([nextOrders, nextFraudLogs]) => {
      setOrders(Array.isArray(nextOrders) ? nextOrders : []);
      setFraudLogs(Array.isArray(nextFraudLogs) ? nextFraudLogs : []);
    });
  }, []);

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
      <OrdersView orders={orders} />
    </div>
  );
}
