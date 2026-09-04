import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RiderBottomNav } from "@/components/rider/rider-bottom-nav";
import { apiFetch } from "@/lib/api";

type Job = { id: string; status: string; pickupAddress: string; dropoffAddress: string; finalFare?: number | null; estimatedFare?: number | null; requestedAt?: string; order?: { customer?: { name?: string } | null } | null };

export default async function RiderDeliveriesPage() {
  const token = (await cookies()).get("empanada-rider-token")?.value;
  if (!token) redirect("/rider/login");
  try {
    const jobs = await apiFetch<Job[]>("/rider/jobs", undefined, token);
    const active = jobs.filter(j => !["delivered", "cancelled"].includes(j.status));
    const completed = jobs.filter(j => ["delivered", "cancelled"].includes(j.status));
    return (
      <main className="min-h-[100dvh] bg-[#FFF6EC] px-4 pb-28 pt-6 text-[#241C18] sm:px-6">
        <div className="mx-auto w-full max-w-lg">
          <h1 className="text-2xl font-black">Deliveries</h1>
          <p className="mt-1 text-sm text-[#756D66]">Your assigned deliveries for today.</p>
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-[#8A817A]">Active</h2>
            {active.length ? active.map(job => (
              <div key={job.id} className="mb-3 rounded-[24px] bg-white p-5 shadow-[0_12px_30px_rgba(59,29,15,0.08)] ring-1 ring-[#F0E4D6]">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-[#8A817A]">{job.status.replaceAll("_", " ")}</p><h3 className="mt-1 font-black">{job.order?.customer?.name ?? "Customer"}</h3></div><span className="font-black">₱{Number(job.finalFare ?? job.estimatedFare ?? 0).toFixed(2)}</span></div>
                <p className="mt-4 text-sm font-semibold">{job.pickupAddress}</p><p className="mt-2 text-sm font-semibold text-[#756D66]">→ {job.dropoffAddress}</p>
                <Link href={`/rider/map?jobId=${encodeURIComponent(job.id)}`} className="mt-4 flex justify-center rounded-2xl bg-[#111827] px-4 py-3 text-sm font-black text-white">Open navigation</Link>
              </div>
            )) : <div className="rounded-[24px] bg-white p-6 text-center text-sm text-[#756D66]">No active deliveries.</div>}
          </section>
          <section className="mt-7"><h2 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-[#8A817A]">History</h2>{completed.length ? completed.map(job => <div key={job.id} className="mb-2 rounded-2xl bg-white p-4 ring-1 ring-[#F0E4D6]"><div className="flex justify-between gap-3"><div><p className="font-black">{job.order?.customer?.name ?? "Customer"}</p><p className="mt-1 text-xs text-[#756D66]">{job.status}</p></div><span className="font-black">₱{Number(job.finalFare ?? job.estimatedFare ?? 0).toFixed(2)}</span></div></div>) : <div className="rounded-[24px] bg-white p-6 text-center text-sm text-[#756D66]">No completed deliveries yet.</div>}</section>
        </div><RiderBottomNav />
      </main>
    );
  } catch { redirect("/rider/login"); }
}
