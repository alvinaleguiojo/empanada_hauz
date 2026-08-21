import { CheckCircle2, Clock3, PackageCheck, Truck } from "lucide-react";
import { DeliveryTable } from "@/components/deliveries/delivery-table";
import { ManualDeliveryForm } from "@/components/deliveries/manual-delivery-form";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

export default async function DeliveriesPage() {
  const items = await apiFetch<any[]>("/deliveries/queue").catch(() => []);

  const booked = items.filter((item) => item.deliveryStatus === "booked").length;
  const completed = items.filter((item) => item.deliveryStatus === "completed").length;
  const cancelled = items.filter((item) => item.deliveryStatus === "cancelled").length;
  const awaitingBooking = items.filter(
    (item) => !item.deliveryStatus || !["booked", "completed", "cancelled"].includes(item.deliveryStatus)
  ).length;

  const stats = [
    {
      label: "Delivery jobs",
      value: items.length,
      description: "Jobs currently in the delivery queue",
      icon: PackageCheck
    },
    {
      label: "Awaiting booking",
      value: awaitingBooking,
      description: "Ready to be booked with Maxim",
      icon: Clock3
    },
    {
      label: "Booked",
      value: booked,
      description: "Assigned or currently in transit",
      icon: Truck
    },
    {
      label: "Completed",
      value: completed,
      description: cancelled ? `${cancelled} cancelled` : "Successfully delivered",
      icon: CheckCircle2
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-accent">Operations · Delivery</p>
          <h1 className="text-3xl font-semibold tracking-tight">Deliveries</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-foreground/55">
            Prepare orders for rider booking, keep delivery details in one place, and update Maxim tracking as jobs move through the route.
          </p>
        </div>
        <div className="rounded-xl border border-line/70 bg-white/[0.03] px-4 py-3 text-sm text-foreground/65">
          <span className="font-semibold text-foreground">Workflow:</span> create job → book Maxim → add tracking → mark complete
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, description, icon: Icon }) => (
          <Card key={label} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-foreground/55">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
                <p className="mt-1 text-xs leading-5 text-foreground/45">{description}</p>
              </div>
              <div className="rounded-lg border border-line/70 bg-white/[0.04] p-2 text-accent">
                <Icon size={18} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <ManualDeliveryForm />

      <div>
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Delivery Queue</h2>
            <p className="text-sm text-foreground/55">Copy the prepared booking details, then save Maxim rider and tracking information here.</p>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/40">Manual Maxim workflow</p>
        </div>
        <DeliveryTable items={items} />
      </div>
    </div>
  );
}
