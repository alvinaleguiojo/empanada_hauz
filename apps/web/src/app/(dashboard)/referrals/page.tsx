import Link from "next/link";
import { ReferralsDashboard, type ReferralPartnersPage, type ReferralsOverview } from "@/components/referrals/referrals-dashboard";
import { apiFetch } from "@/lib/api";

const emptyReferrals: ReferralsOverview = {
  user: { id: "", name: "", email: "", role: undefined },
  referralCode: "",
  referralPath: "/customer",
  totalReferrals: 0,
  uniqueCustomers: 0,
  totalRevenue: 0,
  referrals: []
};
const emptyPartners: ReferralPartnersPage = {
  items: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, pendingCount: 0 }
};
type AllReferralsResponse = { totalReferrals: number; uniqueCustomers: number; totalRevenue: number; unpaidCommission?: number; paidCommission?: number; referrals: ReferralsOverview["referrals"] };

export default async function ReferralsPage() {
  const initialData = await apiFetch<ReferralsOverview>("/referrals/me").catch(() => emptyReferrals);
  const isAdmin = initialData.user.role === "admin";
  const partners = isAdmin ? await apiFetch<ReferralPartnersPage>("/referrals/partners?page=1&pageSize=10").catch(() => emptyPartners) : emptyPartners;
  const overview = isAdmin
    ? await apiFetch<AllReferralsResponse>("/referrals/all").then((all) => ({ ...initialData, ...all })).catch(() => initialData)
    : initialData;

  return <div className="space-y-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-foreground/55">Referral link, customer attribution, and referral order history.</p><h1 className="text-3xl font-semibold">Referrals</h1></div>{isAdmin ? <Link href="/referral-chat" className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-black">Open Referral Chat</Link> : null}</div><ReferralsDashboard initialData={overview} initialPartners={partners} allowAdminActions={isAdmin} /></div>;
}
