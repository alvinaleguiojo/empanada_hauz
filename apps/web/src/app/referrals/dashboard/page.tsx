import type { Route } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ReferralChat } from "@/components/referrals/referral-chat";
import { ReferralsDashboard, type ReferralsOverview } from "@/components/referrals/referrals-dashboard";
import { apiFetch } from "@/lib/api";

const emptyReferrals: ReferralsOverview = { user: { id: "", name: "", email: "" }, referralCode: "", referralPath: "/customer", totalReferrals: 0, uniqueCustomers: 0, totalRevenue: 0, referrals: [] };

export default async function ReferralPartnerDashboardPage() {
  const token = (await cookies()).get("empanada-referral-token")?.value;
  if (!token) redirect("/referrals/login");
  const status = await apiFetch<{ approved: boolean }>("/referrals/partners/status", undefined, token).catch(() => ({ approved: false }));
  if (!status.approved) redirect("/referrals/pending" as Route);
  const initialData = await apiFetch<ReferralsOverview>("/referrals/partners/me", undefined, token).catch(() => emptyReferrals);

  return (
    <main className="min-h-screen p-4 text-foreground sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div>
          <p className="text-sm text-foreground/55">Share your link and track referred orders.</p>
          <h1 className="text-3xl font-semibold">Referral Dashboard</h1>
        </div>
        <ReferralsDashboard initialData={initialData} endpoint="/referrals/partners/me" tokenStorageKey="empanada-referral-token" showLogout />
      </div>

      <ReferralChat mode="partner" tokenStorageKey="empanada-referral-token" floating />
    </main>
  );
}
