import { ManualOrderForm } from "@/components/orders/manual-order-form";
import { OrdersBoard } from "@/components/orders/orders-board";
import { apiFetch } from "@/lib/api";

export default async function OrdersPage() {
  const orders = await apiFetch<any[]>("/orders").catch(() => []);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-foreground/45">Manual order entry, workflow tracking, and dispatch readiness.</p>
        <h1 className="text-3xl font-semibold">Orders</h1>
      </div>
      <ManualOrderForm />
      <OrdersBoard orders={orders} />
    </div>
  );
}
