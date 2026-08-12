"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, ExternalLink, LogOut, Loader2, Search, Share2, TicketPercent, UsersRound, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

type Referral = {
  id: string;
  customerName: string;
  phoneNumber?: string | null;
  orderNumber?: string | null;
  orderTotal: number;
  status: string;
  commissionPercentage: number;
  commissionAmount: number;
  commissionPaidAt?: string | null;
  createdAt: string;
};

export type ReferralPartner = {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string | null;
  referralCode: string;
  approvalStatus: string;
  approvedAt?: string | null;
  createdAt?: string | null;
};

export type ReferralsOverview = {
  user: {
    id: string;
    name: string;
    email: string;
    role?: string;
  };
  referralCode: string;
  referralPath: string;
  totalReferrals: number;
  uniqueCustomers: number;
  totalRevenue: number;
  unpaidCommission?: number;
  paidCommission?: number;
  referrals: Referral[];
};

export type ReferralPartnersPage = {
  items: ReferralPartner[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    pendingCount: number;
  };
};

const emptyPartnersPage: ReferralPartnersPage = {
  items: [],
  pagination: {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    pendingCount: 0
  }
};

export function ReferralsDashboard({
  initialData,
  initialPartners = emptyPartnersPage,
  endpoint = "/referrals/me",
  tokenStorageKey = "empanada-token",
  allowAdminActions = false,
  showLogout = false
}: {
  initialData: ReferralsOverview;
  initialPartners?: ReferralPartnersPage;
  endpoint?: string;
  tokenStorageKey?: string;
  allowAdminActions?: boolean;
  showLogout?: boolean;
}) {
  const [data, setData] = useState(initialData);
  const [partnersPage, setPartnersPage] = useState(initialPartners);
  const [partnerSearchInput, setPartnerSearchInput] = useState("");
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partnerPage, setPartnerPage] = useState(initialPartners.pagination.page);
  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [updatingReferralId, setUpdatingReferralId] = useState<string | null>(null);
  const [approvingPartnerId, setApprovingPartnerId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [commissionDrafts, setCommissionDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const referralUrl = useMemo(() => `${origin}${data.referralPath}`, [data.referralPath, origin]);
  const partners = partnersPage.items;

  useEffect(() => {
    if (!allowAdminActions) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPartnerPage(1);
      setPartnerSearch(partnerSearchInput.trim());
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [allowAdminActions, partnerSearchInput]);

  useEffect(() => {
    if (!allowAdminActions) {
      return;
    }

    void loadPartners({ page: partnerPage, search: partnerSearch });
  }, [allowAdminActions, partnerPage, partnerSearch]);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const token = window.localStorage.getItem(tokenStorageKey) ?? undefined;
      setData(await apiFetch<ReferralsOverview>(endpoint, undefined, token));
      if (allowAdminActions) {
        await loadPartners({ page: partnerPage, search: partnerSearch });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load referral data.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPartners(params: { page: number; search: string }) {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        page: String(params.page),
        pageSize: String(partnersPage.pagination.pageSize)
      });
      if (params.search) {
        query.set("search", params.search);
      }

      const nextPage = await apiFetch<ReferralPartnersPage>(`/referrals/partners?${query.toString()}`);
      setPartnersPage(nextPage);
      if (nextPage.pagination.page !== params.page) {
        setPartnerPage(nextPage.pagination.page);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load referral users.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard?.writeText(referralUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function updateCommission(referral: Referral) {
    const nextPercentage = Number(commissionDrafts[referral.id] ?? referral.commissionPercentage ?? 0);
    if (!Number.isFinite(nextPercentage) || nextPercentage < 0 || nextPercentage > 100) {
      setError("Commission percentage must be between 0 and 100.");
      return;
    }

    setUpdatingReferralId(referral.id);
    setError("");
    try {
      const updated = await apiFetch<Referral>(`/referrals/${referral.id}/commission`, {
        method: "PATCH",
        body: JSON.stringify({ commissionPercentage: nextPercentage })
      });
      replaceReferral(updated);
      setCommissionDrafts((current) => ({ ...current, [referral.id]: String(updated.commissionPercentage) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update commission.");
    } finally {
      setUpdatingReferralId(null);
    }
  }

  async function markPaid(referral: Referral) {
    setUpdatingReferralId(referral.id);
    setError("");
    try {
      replaceReferral(await apiFetch<Referral>(`/referrals/${referral.id}/paid`, { method: "PATCH" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark referral paid.");
    } finally {
      setUpdatingReferralId(null);
    }
  }

  function replaceReferral(updated: Referral) {
    setData((current) => ({
      ...current,
      unpaidCommission: recalculateCommission(current.referrals.map((referral) => (referral.id === updated.id ? updated : referral))).unpaid,
      paidCommission: recalculateCommission(current.referrals.map((referral) => (referral.id === updated.id ? updated : referral))).paid,
      referrals: current.referrals.map((referral) => (referral.id === updated.id ? updated : referral))
    }));
  }

  function logout() {
    window.localStorage.removeItem(tokenStorageKey);
    document.cookie = `${tokenStorageKey}=; path=/; max-age=0`;
    window.location.href = tokenStorageKey === "empanada-referral-token" ? "/referrals/login" : "/login";
  }

  async function approvePartner(partner: ReferralPartner) {
    setApprovingPartnerId(partner.id);
    setError("");
    try {
      const updated = await apiFetch<ReferralPartner>(`/referrals/partners/${partner.id}/approve`, { method: "PATCH" });
      setPartnersPage((current) => ({
        ...current,
        items: current.items.map((item) => (item.id === updated.id ? updated : item)),
        pagination: {
          ...current.pagination,
          pendingCount: Math.max(0, current.pagination.pendingCount - (partner.approvalStatus === "approved" ? 0 : 1))
        }
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to approve referral user.");
    } finally {
      setApprovingPartnerId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <ReferralMetric icon={TicketPercent} label="Referrals" value={String(data.totalReferrals)} hint="Orders submitted through your link" />
        <ReferralMetric icon={UsersRound} label="Customers" value={String(data.uniqueCustomers)} hint="Unique referred customers" />
        <ReferralMetric icon={WalletCards} label="Sales" value={formatPeso(data.totalRevenue)} hint="Revenue attributed to referrals" />
        <ReferralMetric icon={WalletCards} label="Unpaid" value={formatPeso(data.unpaidCommission ?? 0)} hint="Commission awaiting payout" />
        <ReferralMetric icon={CheckCircle2} label="Paid" value={formatPeso(data.paidCommission ?? 0)} hint="Commission already paid" />
      </div>

      {error ? <p className="rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

      {!allowAdminActions ? (
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-accent/25 bg-accent/[0.08] text-accent">
              <Share2 size={19} />
            </div>
            <h2 className="text-lg font-semibold">Your Referral Link</h2>
            <p className="mt-1 text-sm text-foreground/50">Code {data.referralCode}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void refresh()} disabled={loading}>
              {loading ? <Loader2 size={17} className="animate-spin" /> : null}
              Refresh
            </Button>
            <Button type="button" onClick={() => void copyLink()} disabled={!origin}>
              <Copy size={17} />
              {copied ? "Copied" : "Copy Link"}
            </Button>
            {showLogout ? (
              <Button type="button" variant="danger" onClick={logout}>
                <LogOut size={17} />
                Logout
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            readOnly
            value={referralUrl}
            className="h-11 min-w-0 rounded-lg border border-line bg-black/15 px-3 text-sm text-foreground outline-none"
          />
          <a
            href={data.referralPath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.07] px-4 text-sm font-semibold text-foreground transition hover:bg-white/[0.12]"
          >
            Open <ExternalLink size={16} />
          </a>
        </div>
      </Card>
      ) : null}

      {allowAdminActions ? (
        <Card>
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Referral User Approval</h2>
              <p className="text-sm text-foreground/50">Approve external referral users before their links become active.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 sm:w-[320px]">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" />
                <Input
                  value={partnerSearchInput}
                  onChange={(event) => setPartnerSearchInput(event.target.value)}
                  placeholder="Search users"
                  className="pl-9"
                />
              </div>
              <Button type="button" variant="secondary" onClick={() => void refresh()} disabled={loading}>
                {loading ? <Loader2 size={17} className="animate-spin" /> : null}
                Refresh
              </Button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-foreground/62">
            <p className="font-semibold tabular-nums">{partnersPage.pagination.pendingCount} pending</p>
            <p className="tabular-nums">
              Showing {partners.length === 0 ? 0 : (partnersPage.pagination.page - 1) * partnersPage.pagination.pageSize + 1}
              -{Math.min(partnersPage.pagination.page * partnersPage.pagination.pageSize, partnersPage.pagination.total)} of {partnersPage.pagination.total}
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Phone</Th>
                  <Th>Code</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {partners.map((partner) => {
                  const approving = approvingPartnerId === partner.id;
                  const approved = partner.approvalStatus === "approved";
                  return (
                    <tr key={partner.id}>
                      <Td>{partner.name}</Td>
                      <Td>{partner.email}</Td>
                      <Td>{partner.phoneNumber ?? "-"}</Td>
                      <Td>{partner.referralCode}</Td>
                      <Td>{approved ? "Approved" : "Pending"}</Td>
                      <Td>
                        <Button type="button" className="h-9 px-3" disabled={approved || approving} onClick={() => void approvePartner(partner)}>
                          {approving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                          Approve
                        </Button>
                      </Td>
                    </tr>
                  );
                })}
                {partners.length === 0 ? (
                  <tr>
                    <Td colSpan={6}>
                      <span className="text-foreground/50">No referral users yet.</span>
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground/50 tabular-nums">
              Page {partnersPage.pagination.page} of {partnersPage.pagination.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="h-9 px-3"
                disabled={loading || partnersPage.pagination.page <= 1}
                onClick={() => setPartnerPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft size={16} />
                Prev
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-9 px-3"
                disabled={loading || partnersPage.pagination.page >= partnersPage.pagination.totalPages}
                onClick={() => setPartnerPage((current) => current + 1)}
              >
                Next
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Referral Orders</h2>
            <p className="text-sm text-foreground/50">Latest orders attributed to your referral code.</p>
          </div>
          <p className="text-sm font-semibold tabular-nums text-foreground/62">{data.referrals.length} shown</p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th>Order</Th>
                <Th>Status</Th>
                <Th>Total</Th>
                <Th>Commission</Th>
                <Th>Paid</Th>
                {allowAdminActions ? <Th>Actions</Th> : null}
              </tr>
            </thead>
            <tbody>
              {data.referrals.map((referral) => {
                const updating = updatingReferralId === referral.id;
                const percentage = commissionDrafts[referral.id] ?? String(referral.commissionPercentage ?? 0);
                return (
                  <tr key={referral.id}>
                    <Td>{formatDate(referral.createdAt)}</Td>
                    <Td>
                      <div>
                        <p className="font-medium">{referral.customerName}</p>
                        {referral.phoneNumber ? <p className="text-xs text-foreground/42">{referral.phoneNumber}</p> : null}
                      </div>
                    </Td>
                    <Td>{referral.orderNumber ?? "Pending"}</Td>
                    <Td>{formatStatus(referral.status)}</Td>
                    <Td>{formatPeso(referral.orderTotal)}</Td>
                    <Td>
                      <div className="min-w-[128px]">
                        <p className="font-semibold">{formatPeso(referral.commissionAmount ?? 0)}</p>
                        <p className="text-xs text-foreground/42">{Number(referral.commissionPercentage ?? 0)}%</p>
                      </div>
                    </Td>
                    <Td>{referral.commissionPaidAt ? formatDate(referral.commissionPaidAt) : "Unpaid"}</Td>
                    {allowAdminActions ? (
                      <Td>
                        <div className="flex min-w-[260px] flex-wrap items-center gap-2">
                          <input
                            aria-label="Commission percentage"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={percentage}
                            onChange={(event) => setCommissionDrafts((current) => ({ ...current, [referral.id]: event.target.value }))}
                            className="h-9 w-20 rounded-lg border border-line bg-black/15 px-2 text-sm text-foreground outline-none"
                          />
                          <Button type="button" variant="secondary" className="h-9 px-3" disabled={updating} onClick={() => void updateCommission(referral)}>
                            {updating ? <Loader2 size={15} className="animate-spin" /> : null}
                            Set %
                          </Button>
                          <Button type="button" className="h-9 px-3" disabled={updating || Boolean(referral.commissionPaidAt)} onClick={() => void markPaid(referral)}>
                            Paid
                          </Button>
                        </div>
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
              {data.referrals.length === 0 ? (
                <tr>
                  <Td colSpan={allowAdminActions ? 8 : 7}>
                    <span className="text-foreground/50">No referral orders yet.</span>
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function ReferralMetric({ icon: Icon, label, value, hint }: { icon: typeof TicketPercent; label: string; value: string; hint: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/42">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-sm text-foreground/48">{hint}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line/80 bg-black/10 text-foreground/65">
          <Icon size={19} />
        </div>
      </div>
    </Card>
  );
}

function formatPeso(value: number) {
  return `Php ${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function recalculateCommission(referrals: Referral[]) {
  return referrals.reduce(
    (totals, referral) => ({
      unpaid: totals.unpaid + (referral.commissionPaidAt ? 0 : Number(referral.commissionAmount ?? 0)),
      paid: totals.paid + (referral.commissionPaidAt ? Number(referral.commissionAmount ?? 0) : 0)
    }),
    { unpaid: 0, paid: 0 }
  );
}
