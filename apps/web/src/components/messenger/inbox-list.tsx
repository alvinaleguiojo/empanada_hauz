import { Card } from "@/components/ui/card";

export function InboxList({ customers }: { customers: Array<any> }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {customers.map((customer) => (
        <Card key={customer.id}>
          <p className="text-lg font-semibold">{customer.name}</p>
          <p className="mt-1 text-sm text-foreground/55">{customer.phoneNumber ?? "Messenger only"}</p>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span>{customer.totalOrders} orders</span>
            <span>{customer.isVip ? "VIP" : "Standard"}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}
