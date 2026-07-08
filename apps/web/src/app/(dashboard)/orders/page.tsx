import { ManualOrderForm } from "@/components/orders/manual-order-form";
import { OrdersBoard } from "@/components/orders/orders-board";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const today = new Date().toISOString().slice(0, 10);
  const orders = await apiFetch<any[]>(`/orders?date=${encodeURIComponent(today)}`).catch(() => []);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-foreground/45">Manual order entry, workflow tracking, and dispatch readiness.</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">Orders</h1>
      </div>
      <ManualOrderForm />
      <OrdersBoard orders={orders} />
    </div>
  );
}
