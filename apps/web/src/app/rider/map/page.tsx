import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RiderMapShell } from "@/components/rider/rider-map-shell";
import { apiFetch } from "@/lib/api";

type RiderProfile = { user: { role: string } };
type Job = { id: string; status: string; pickupAddress: string; pickupLatitude?: number | null; pickupLongitude?: number | null; dropoffAddress: string; dropoffLatitude?: number | null; dropoffLongitude?: number | null; estimatedFare?: number | null; finalFare?: number | null; deliveryFee?: number | null; codAmount?: number | null; order?: { customer: { name: string; phoneNumber?: string | null }; codAmount?: number | null; amountDue?: number | null; totalAmount?: number | null; deliveryFee?: number | null } | null };

export default async function RiderMapPage() {
  const token = (await cookies()).get("empanada-rider-token")?.value;
  if (!token) redirect("/rider/login");

  try {
    const profile = await apiFetch<RiderProfile>("/rider/me", undefined, token);
    if (profile.user.role !== "rider") redirect("/rider/login");

    const jobs = await apiFetch<Job[]>("/rider/jobs", undefined, token);
    const job = jobs.find((item) => ["delivering", "picked_up", "pickup_started", "accepted", "assigned"].includes(item.status));
    if (!job) redirect("/rider");

    return <RiderMapShell job={job} />;
  } catch {
    redirect("/rider/login");
  }
}
