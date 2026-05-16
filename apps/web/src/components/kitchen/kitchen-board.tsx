import { Card } from "@/components/ui/card";

const groups = [
  { key: "pending", label: "Pending" },
  { key: "active", label: "Preparing" },
  { key: "frying", label: "Frying" },
  { key: "packed", label: "Packed" },
  { key: "completed", label: "Completed" }
];

export function KitchenBoard({ board }: { board: Record<string, Array<any>> }) {
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      {groups.map((group) => (
        <Card key={group.key} className="min-h-[320px]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">{group.label}</h3>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{board[group.key]?.length ?? 0}</span>
          </div>
          <div className="space-y-4">
            {(board[group.key] ?? []).map((order) => (
              <button
                key={order.id}
                className="w-full rounded-2xl border border-line bg-black/10 px-4 py-5 text-left text-base font-semibold"
              >
                <div>{order.customer.name}</div>
                <div className="mt-1 text-sm font-normal text-foreground/55">{order.quantity} pcs</div>
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
