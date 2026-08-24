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
  const token = (await cookies()).get("empanada-token")?.value;

  if (!token) {
    redirect("/login?next=/rider");
  }

  try {
    const profile = await apiFetch<RiderProfile>("/rider/me", undefined, token);
    if (profile.user.role !== "rider") {
      redirect("/dashboard");
    }
  } catch {
    redirect("/dashboard");
  }

  return <RiderMapApp />;
}
