import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RiderBottomNav } from "@/components/rider/rider-bottom-nav";
import { apiFetch } from "@/lib/api";

type Job = { id: string; status: string; finalFare?: number | null; estimatedFare?: number | null };
export default async function RiderEarningsPage() {
  const token = (await cookies()).get("empanada-rider-token")?.value;
  if (!token) redirect("/rider/login");
  try {
    const jobs = await apiFetch<Job[]>("/rider/jobs", undefined, token);
    const completed = jobs.filter(j => j.status === "delivered");
    const total = completed.reduce((sum, j) => sum + Number(j.finalFare ?? j.estimatedFare ?? 0), 0);
    return <main className="min-h-[100dvh] bg-[#FFF6EC] px-4 pb-28 pt-6 text-[#241C18] sm:px-6"><div className="mx-auto max-w-lg"><h1 className="text-2xl font-black">Earnings</h1><p className="mt-1 text-sm text-[#756D66]">Your delivery earnings for today.</p><div className="mt-6 rounded-[28px] bg-[#111827] p-6 text-white shadow-[0_18px_45px_rgba(59,29,15,0.15)]"><p className="text-xs font-black uppercase tracking-[0.14em] text-white/60">Today's earnings</p><p className="mt-2 text-4xl font-black">₱{total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="mt-2 text-sm text-white/70">{completed.length} completed {completed.length === 1 ? "delivery" : "deliveries"}</p></div><div className="mt-5 rounded-[24px] bg-white p-5 ring-1 ring-[#F0E4D6]"><div className="flex justify-between"><span className="font-bold text-[#756D66]">Completed deliveries</span><span className="font-black">{completed.length}</span></div><div className="mt-3 flex justify-between"><span className="font-bold text-[#756D66]">Average per delivery</span><span className="font-black">₱{(completed.length ? total / completed.length : 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div></div></div><RiderBottomNav /></main>;
  } catch { redirect("/rider/login"); }
}
