import { ReferralsDashboard, type ReferralPartnersPage, type ReferralsOverview } from "@/components/referrals/referrals-dashboard";
import { apiFetch } from "@/lib/api";

const emptyReferrals: ReferralsOverview = {
  user: {
    id: "",
    name: "",
    email: "",
    role: undefined
  },
  referralCode: "",
  referralPath: "/customer",
  totalReferrals: 0,
  uniqueCustomers: 0,
  totalRevenue: 0,
  referrals: []
};

const emptyPartners: ReferralPartnersPage = {
  items: [],
  pagination: {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    pendingCount: 0
  }
};

export default async function ReferralsPage() {
  const initialData = await apiFetch<ReferralsOverview>("/referrals/me").catch(() => emptyReferrals);
  const partners = initialData.user.role === "admin"
    ? await apiFetch<ReferralPartnersPage>("/referrals/partners?page=1&pageSize=10").catch(() => emptyPartners)
    : emptyPartners;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-foreground/55">Referral link, customer attribution, and referral order history.</p>
        <h1 className="text-3xl font-semibold">Referrals</h1>
      </div>
      <ReferralsDashboard initialData={initialData} initialPartners={partners} allowAdminActions={initialData.user.role === "admin"} />
    </div>
  );
}
