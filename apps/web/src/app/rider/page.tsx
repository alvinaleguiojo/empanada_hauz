import { apiFetch } from "@/lib/api";
import { RiderApp } from "@/components/rider/rider-app";

export default async function RiderPage() {
  const items = await apiFetch<any[]>("/deliveries/queue").catch(() => []);
  return <RiderApp initialItems={items} />;
}
