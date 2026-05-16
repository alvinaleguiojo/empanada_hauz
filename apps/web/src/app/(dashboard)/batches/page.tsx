import { BatchGrid } from "@/components/batches/batch-grid";
import { apiFetch } from "@/lib/api";

export default async function BatchesPage() {
  const batches = await apiFetch<any[]>("/batches").catch(() => []);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-foreground/55">Capacity planning for morning and afternoon production.</p>
        <h1 className="text-3xl font-semibold">Batches</h1>
      </div>
      <BatchGrid batches={batches} />
    </div>
  );
}
