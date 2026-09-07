import { DispatcherBoard } from "@/components/delivery-network/dispatcher-board";
import { DeliveryPricingSettings } from "@/components/delivery-network/delivery-pricing-settings";
import { RiderLiveMap } from "@/components/delivery-network/rider-live-map";
import { apiFetch } from "@/lib/api";

type DeliveryPricing = { baseFare: number; perKmRate: number };

export default async function DeliveryNetworkPage() {
  const [riders, jobs, pricing] = await Promise.all([
    apiFetch<any[]>("/delivery-network/riders").catch(() => []),
    apiFetch<any[]>("/delivery-network/jobs").catch(() => []),
    apiFetch<DeliveryPricing>("/delivery-network/pricing").catch(() => ({ baseFare: 30, perKmRate: 10 }))
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-foreground/55">Your own rider network, separate from manual Maxim booking.</p>
        <h1 className="text-3xl font-semibold">Delivery Network</h1>
      </div>
      <DeliveryPricingSettings initialPricing={pricing} />
      <RiderLiveMap initialRiders={riders} initialJobs={jobs} />
      <DispatcherBoard initialRiders={riders} initialJobs={jobs} />
    </div>
  );
}
