import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RiderNavigation } from "@/components/rider/rider-navigation";
import { apiFetch } from "@/lib/api";

type RiderProfile = { id: string; status: "offline" | "online" | "busy" | "suspended"; user: { role: string } };
type Job = { id: string; status: string; pickupAddress: string; pickupLatitude?: number | null; pickupLongitude?: number | null; dropoffAddress: string; dropoffLatitude?: number | null; dropoffLongitude?: number | null; estimatedFare?: number | null; finalFare?: number | null; order?: { customer: { name: string; phoneNumber?: string | null } } | null };

export default async function RiderPage() {
  const token = (await cookies()).get("empanada-rider-token")?.value;
  if (!token) redirect("/rider/login");
  try {
    const profile = await apiFetch<RiderProfile>("/rider/me", undefined, token);
    if (profile.user.role !== "rider") redirect("/rider/login");
    const jobs = await apiFetch<Job[]>("/rider/jobs", undefined, token);
    const job = jobs.find(item => ["delivering", "picked_up", "pickup_started", "accepted", "assigned"].includes(item.status));
    if (!job) return <div className="flex min-h-[100dvh] items-center justify-center bg-[#FFF6EC] p-6 text-center"><div><div className="text-4xl">🧭</div><h1 className="mt-3 text-xl font-black text-[#241C18]">No active delivery</h1><p className="mt-1 text-sm text-[#756D66]">Your navigation screen will appear when a delivery is assigned.</p></div></div>;
    return <RiderNavigation initialJob={job} />;
  } catch {
    redirect("/rider/login");
  }
}
