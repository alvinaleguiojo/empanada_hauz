import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RiderMapApp } from "@/components/rider/rider-map-app";
import { apiFetch } from "@/lib/api";

type RiderProfile = {
  id: string;
  status: "offline" | "online" | "busy" | "suspended";
  user: { role: string };
};

export default async function RiderPage() {
  // Rider sessions use their own cookie so an operations/admin session can never
  // accidentally satisfy the rider page authentication check.
  const token = (await cookies()).get("empanada-rider-token")?.value;

  if (!token) {
    redirect("/rider/login");
  }

  try {
    const profile = await apiFetch<RiderProfile>("/rider/me", undefined, token);
    if (profile.user.role !== "rider") {
      redirect("/rider/login");
    }
  } catch {
    redirect("/rider/login");
  }

  return <RiderMapApp />;
}
