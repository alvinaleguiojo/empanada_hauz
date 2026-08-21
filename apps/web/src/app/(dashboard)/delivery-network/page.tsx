import { DispatcherBoard } from "@/components/delivery-network/dispatcher-board";
import { RiderLiveMap } from "@/components/delivery-network/rider-live-map";
import { apiFetch } from "@/lib/api";

export default async function DeliveryNetworkPage() {
  const [riders, jobs] = await Promise.all([
    apiFetch<any[]>("/delivery-network/riders").catch(() => []),
    apiFetch<any[]>("/delivery-network/jobs").catch(() => [])
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-foreground/55">Your own rider network, separate from manual Maxim booking.</p>
        <h1 className="text-3xl font-semibold">Delivery Network</h1>
      </div>
      <RiderLiveMap initialRiders={riders} />
      <DispatcherBoard initialRiders={riders} initialJobs={jobs} />
    </div>
  );
}
