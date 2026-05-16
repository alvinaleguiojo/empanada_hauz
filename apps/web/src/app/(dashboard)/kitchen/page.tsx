import { KitchenBoard } from "@/components/kitchen/kitchen-board";
import { apiFetch } from "@/lib/api";

export default async function KitchenPage() {
  const board = await apiFetch<any>("/kitchen/board").catch(() => ({
    pending: [],
    active: [],
    frying: [],
    packed: [],
    completed: [],
    batches: []
  }));
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-foreground/55">Tablet-friendly production view with large action surfaces.</p>
        <h1 className="text-3xl font-semibold">Kitchen Queue</h1>
      </div>
      <KitchenBoard board={board} />
    </div>
  );
}
