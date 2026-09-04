import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RiderAppV9 } from "@/components/rider/rider-app-v9";
import { apiFetch } from "@/lib/api";

type RiderProfile = {
  id: string;
  status: "offline" | "online" | "busy" | "suspended";
  user: { role: string };
};

export default async function RiderPage() {
  const token = (await cookies()).get("empanada-rider-token")?.value;
  if (!token) redirect("/rider/login");
  try {
    const profile = await apiFetch<RiderProfile>("/rider/me", undefined, token);
    if (profile.user.role !== "rider") redirect("/rider/login");
  } catch {
    redirect("/rider/login");
  }
  return <RiderAppV9 />;
}
