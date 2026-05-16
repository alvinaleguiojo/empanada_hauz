import { DeliveryTable } from "@/components/deliveries/delivery-table";
import { ManualDeliveryForm } from "@/components/deliveries/manual-delivery-form";
import { apiFetch } from "@/lib/api";

export default async function DeliveriesPage() {
  const items = await apiFetch<any[]>("/deliveries/queue").catch(() => []);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-foreground/55">Prepared payloads for manual Maxim booking.</p>
        <h1 className="text-3xl font-semibold">Deliveries</h1>
      </div>
      <ManualDeliveryForm />
      <DeliveryTable items={items} />
    </div>
  );
}
