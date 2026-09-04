import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
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
    const job = jobs.find((item) => ["delivering", "picked_up", "pickup_started", "accepted", "assigned"].includes(item.status));

    return (
      <main className="min-h-[100dvh] bg-[#FFF6EC] px-4 py-6 text-[#241C18] sm:px-6">
        <div className="mx-auto w-full max-w-lg">
          <div className="rounded-[30px] bg-white p-6 shadow-[0_18px_45px_rgba(59,29,15,0.12)] ring-1 ring-[#F0E4D6]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8A817A]">Empanada Hauz</p>
                <h1 className="mt-1 text-2xl font-black">Rider Dashboard</h1>
              </div>
              <div className="rounded-full bg-[#EAF7EE] px-3 py-1.5 text-xs font-black text-[#217A3B]">{profile.status}</div>
            </div>

            {job ? (
              <div className="mt-6 rounded-[24px] bg-[#F7F2EC] p-5">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8A817A]">Active delivery</p>
                <h2 className="mt-2 text-lg font-black">{job.order?.customer?.name ?? "Customer"}</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <div><span className="font-bold text-[#8A817A]">Pickup</span><div className="font-semibold">{job.pickupAddress}</div></div>
                  <div><span className="font-bold text-[#8A817A]">Drop-off</span><div className="font-semibold">{job.dropoffAddress}</div></div>
                </div>
                <Link href="/rider/map" className="mt-5 flex w-full items-center justify-center rounded-2xl bg-[#111827] px-4 py-4 text-sm font-black text-white shadow-lg transition hover:bg-[#1f2937]">
                  Open navigation map
                </Link>
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] bg-[#F7F2EC] p-6 text-center">
                <div className="text-4xl">🧭</div>
                <h2 className="mt-3 text-xl font-black">No active delivery</h2>
                <p className="mt-1 text-sm text-[#756D66]">Your navigation screen will appear when a delivery is assigned.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  } catch {
    redirect("/rider/login");
  }
}
