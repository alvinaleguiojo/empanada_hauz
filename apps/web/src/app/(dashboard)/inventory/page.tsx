import { InventoryTable } from "@/components/inventory/inventory-table";
import { apiFetch } from "@/lib/api";

export default async function InventoryPage() {
  const items = await apiFetch<any[]>("/inventory").catch(() => []);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-foreground/55">Ingredients, cost tracking, and low-stock visibility.</p>
        <h1 className="text-3xl font-semibold">Inventory</h1>
      </div>
      <InventoryTable items={items} />
    </div>
  );
}
