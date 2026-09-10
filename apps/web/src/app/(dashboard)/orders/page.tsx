import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { ManualOrderForm } from "@/components/orders/manual-order-form";
import { OrdersView } from "@/components/orders/orders-view";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const today = new Date().toISOString().slice(0, 10);
  const orders = await apiFetch<any[]>(`/orders?date=${encodeURIComponent(today)}`).catch(() => []);
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-foreground/45">Manual order entry, workflow tracking, and dispatch readiness.</p>
          <h1 className="text-2xl font-semibold sm:text-3xl">Orders</h1>
        </div>
        <Link href="/calendar">
          <Button type="button" variant="secondary" className="gap-2">
            <CalendarDays size={16} />
            Calendar
          </Button>
        </Link>
      </div>
      <ManualOrderForm />
      <OrdersView orders={orders} />
    </div>
  );
}
