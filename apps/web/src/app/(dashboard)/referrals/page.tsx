import { ReferralCrm } from "@/components/referrals/referral-crm";
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

type AllReferralsResponse = {
  totalReferrals: number;
  uniqueCustomers: number;
  totalRevenue: number;
  unpaidCommission?: number;
  paidCommission?: number;
  referrals: ReferralsOverview["referrals"];
};

export default async function ReferralsPage() {
  const initialData = await apiFetch<ReferralsOverview>("/referrals/me").catch(() => emptyReferrals);
  const isAdmin = initialData.user.role === "admin";

  if (!isAdmin) {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm text-foreground/55">Referral link, customer attribution, and referral order history.</p>
          <h1 className="text-3xl font-semibold">Referrals</h1>
        </div>
        <ReferralsDashboard initialData={initialData} initialPartners={emptyPartners} />
      </div>
    );
  }

  const [partners, all] = await Promise.all([
    apiFetch<ReferralPartnersPage>("/referrals/partners?page=1&pageSize=50").catch(() => emptyPartners),
    apiFetch<AllReferralsResponse>("/referrals/all").catch(() => ({
      totalReferrals: 0,
      uniqueCustomers: 0,
      totalRevenue: 0,
      unpaidCommission: 0,
      paidCommission: 0,
      referrals: []
    }))
  ]);

  const overview = { ...initialData, ...all };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-foreground/55">Manage referral partners, orders, commissions, payouts, and conversations from one workspace.</p>
        <h1 className="text-3xl font-semibold">Referral CRM</h1>
      </div>
      <ReferralCrm initialData={overview} initialPartners={partners} />
    </div>
  );
}
