import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RiderBottomNav } from "@/components/rider/rider-bottom-nav";
import { apiFetch } from "@/lib/api";

type Job = { id: string; status: string; requestedAt?: string; order?: { customer?: { name?: string } | null } | null };
export default async function RiderNotificationsPage() {
  const token = (await cookies()).get("empanada-rider-token")?.value;
  if (!token) redirect("/rider/login");
  try {
    const jobs = await apiFetch<Job[]>("/rider/jobs", undefined, token);
    const active = jobs.filter(j => !["delivered", "cancelled"].includes(j.status));
    return <main className="min-h-[100dvh] bg-[#FFF6EC] px-4 pb-28 pt-6 text-[#241C18] sm:px-6"><div className="mx-auto max-w-lg"><h1 className="text-2xl font-black">Notifications</h1><p className="mt-1 text-sm text-[#756D66]">Delivery and account updates.</p><div className="mt-6 space-y-3">{active.length ? active.map(j => <div key={j.id} className="rounded-[24px] bg-white p-5 ring-1 ring-[#F0E4D6]"><div className="flex gap-3"><div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF7EE] text-[#217A3B]">✓</div><div><p className="font-black">Delivery assigned</p><p className="mt-1 text-sm text-[#756D66]">{j.order?.customer?.name ?? "Customer"} has an active delivery for you.</p><p className="mt-2 text-xs font-semibold text-[#A0968E]">{j.status.replaceAll("_", " ")}</p></div></div></div>) : <div className="rounded-[24px] bg-white p-6 text-center text-sm text-[#756D66]">You're all caught up. New delivery assignments will appear here.</div>}</div></div><RiderBottomNav /></main>;
  } catch { redirect("/rider/login"); }
}
