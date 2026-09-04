import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RiderBottomNav } from "@/components/rider/rider-bottom-nav";
import { apiFetch } from "@/lib/api";

type Profile = { id: string; status: string; completedJobs?: number; user: { name?: string; email?: string; role: string }; vehicles?: { id: string; make?: string; model?: string; plateNumber?: string }[] };
export default async function RiderProfilePage() {
  const token = (await cookies()).get("empanada-rider-token")?.value;
  if (!token) redirect("/rider/login");
  try {
    const profile = await apiFetch<Profile>("/rider/me", undefined, token);
    return <main className="min-h-[100dvh] bg-[#FFF6EC] px-4 pb-28 pt-6 text-[#241C18] sm:px-6"><div className="mx-auto max-w-lg"><h1 className="text-2xl font-black">Profile</h1><div className="mt-6 rounded-[28px] bg-white p-6 shadow-[0_12px_30px_rgba(59,29,15,0.08)] ring-1 ring-[#F0E4D6]"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F7E6D3] text-2xl font-black">{(profile.user.name ?? "R").slice(0,1).toUpperCase()}</div><h2 className="mt-4 text-xl font-black">{profile.user.name ?? "Rider"}</h2><p className="mt-1 text-sm text-[#756D66]">{profile.user.email ?? ""}</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#F7F2EC] p-4"><p className="text-xs font-bold text-[#8A817A]">Status</p><p className="mt-1 font-black capitalize">{profile.status}</p></div><div className="rounded-2xl bg-[#F7F2EC] p-4"><p className="text-xs font-bold text-[#8A817A]">Completed</p><p className="mt-1 font-black">{profile.completedJobs ?? 0}</p></div></div></div><div className="mt-4 rounded-[24px] bg-white p-5 ring-1 ring-[#F0E4D6]"><h2 className="font-black">Vehicle</h2>{profile.vehicles?.length ? profile.vehicles.map(v => <div key={v.id} className="mt-3 rounded-2xl bg-[#F7F2EC] p-4 text-sm font-semibold">{[v.make, v.model].filter(Boolean).join(" ") || "Motorcycle"}<span className="ml-2 text-[#756D66]">{v.plateNumber ?? "No plate"}</span></div>) : <p className="mt-2 text-sm text-[#756D66]">No active vehicle registered.</p>}</div></div><RiderBottomNav /></main>;
  } catch { redirect("/rider/login"); }
}
