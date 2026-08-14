"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, MessageCircle, Search, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import type { ReferralPartnersPage, ReferralsOverview } from "./referrals-dashboard";

type Referral = ReferralsOverview["referrals"][number];

type ReferralCrmProps = { initialData: ReferralsOverview; initialPartners: ReferralPartnersPage };

export function ReferralCrm({ initialData, initialPartners }: ReferralCrmProps) {
  const [data, setData] = useState(initialData);
  const [partnerId, setPartnerId] = useState("all");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Referral | null>(null);
  const [commissionDraft, setCommissionDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const selectedPartner = useMemo(() => initialPartners.items.find((partner) => partner.id === partnerId) ?? null, [initialPartners.items, partnerId]);
  const statuses = useMemo(() => Array.from(new Set(data.referrals.map((item) => item.status))).filter(Boolean), [data.referrals]);

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.referrals.filter((order) => {
      const partnerMatches = partnerId === "all" || order.referralCode === selectedPartner?.referralCode || order.referrerName === selectedPartner?.name;
      const statusMatches = status === "all" || order.status === status;
      const paymentMatches = payment === "all" || (payment === "paid" ? Boolean(order.commissionPaidAt) : !order.commissionPaidAt);
      const queryMatches = !normalized || order.customerName.toLowerCase().includes(normalized) || (order.orderNumber ?? "").toLowerCase().includes(normalized) || (order.referrerName ?? "").toLowerCase().includes(normalized) || (order.referralCode ?? "").toLowerCase().includes(normalized);
      return partnerMatches && statusMatches && paymentMatches && queryMatches;
    });
  }, [data.referrals, partnerId, payment, query, selectedPartner, status]);

  const totals = useMemo(() => ({
    sales: filteredOrders.reduce((sum, order) => sum + Number(order.orderTotal || 0), 0),
    commission: filteredOrders.reduce((sum, order) => sum + Number(order.commissionAmount || 0), 0),
    unpaid: filteredOrders.reduce((sum, order) => sum + (order.commissionPaidAt ? 0 : Number(order.commissionAmount || 0)), 0)
  }), [filteredOrders]);

  async function refreshOrders() {
    setRefreshing(true); setError("");
    try {
      const result = await apiFetch<Pick<ReferralsOverview, "totalReferrals" | "uniqueCustomers" | "totalRevenue" | "unpaidCommission" | "paidCommission" | "referrals">>("/referrals/all");
      setData((current) => ({ ...current, ...result }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh referral orders.");
    } finally { setRefreshing(false); }
  }

  function openOrder(order: Referral) {
    setSelectedOrder(order); setCommissionDraft(String(order.commissionPercentage ?? 0)); setError("");
  }

  function replaceOrder(updated: Referral) {
    setData((current) => ({ ...current, referrals: current.referrals.map((item) => item.id === updated.id ? updated : item) }));
    setSelectedOrder(updated);
  }

  async function saveCommission() {
    if (!selectedOrder) return;
    const percentage = Number(commissionDraft);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) { setError("Commission percentage must be between 0 and 100."); return; }
    setSaving(true); setError("");
    try {
      const updated = await apiFetch<Referral>(`/referrals/${selectedOrder.id}/commission`, { method: "PATCH", body: JSON.stringify({ commissionPercentage: percentage }) });
      replaceOrder(updated);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update commission."); }
    finally { setSaving(false); }
  }

  async function markPaid() {
    if (!selectedOrder || selectedOrder.commissionPaidAt) return;
    setSaving(true); setError("");
    try {
      const updated = await apiFetch<Referral>(`/referrals/${selectedOrder.id}/paid`, { method: "PATCH" });
      replaceOrder(updated);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to mark commission paid."); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Referral Partners" value={String(initialPartners.pagination.total)} />
        <SummaryCard label="Referral Orders" value={String(data.totalReferrals)} />
        <SummaryCard label="Referral Sales" value={formatPeso(data.totalRevenue)} />
        <SummaryCard label="Unpaid Commission" value={formatPeso(data.unpaidCommission ?? totals.unpaid)} />
      </div>

      {error ? <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div> : null}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Referral Management</p><h2 className="mt-1 text-2xl font-semibold">All Referral Orders</h2><p className="mt-1 text-sm text-foreground/50">Search, review and pay referral commissions from one simple workspace.</p></div>
            <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => void refreshOrders()} disabled={refreshing}>{refreshing ? <Loader2 size={16} className="animate-spin" /> : null}Refresh</Button><Button type="button" variant="secondary" onClick={() => window.location.assign("/referral-chat")}><MessageCircle size={16} />Open Chats</Button></div>
          </div>

          <div className="mt-5 grid gap-2 lg:grid-cols-[minmax(260px,1fr)_220px_180px_180px]">
            <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, or partner" className="pl-9" /></div>
            <select value={partnerId} onChange={(event) => setPartnerId(event.target.value)} className="h-10 rounded-lg border border-line bg-black/15 px-3 text-sm text-foreground outline-none"><option value="all">All referral partners</option>{initialPartners.items.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-line bg-black/15 px-3 text-sm text-foreground outline-none"><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{formatStatus(item)}</option>)}</select>
            <select value={payment} onChange={(event) => setPayment(event.target.value)} className="h-10 rounded-lg border border-line bg-black/15 px-3 text-sm text-foreground outline-none"><option value="all">All commission</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option></select>
          </div>
        </div>

        <div className="grid gap-3 border-b border-line bg-black/[0.03] p-4 sm:grid-cols-3"><MiniStat label="Showing Orders" value={String(filteredOrders.length)} /><MiniStat label="Sales" value={formatPeso(totals.sales)} /><MiniStat label="Commission" value={formatPeso(totals.commission)} /></div>

        <div className="overflow-x-auto"><Table><thead><tr><Th>Partner</Th><Th>Order</Th><Th>Customer</Th><Th>Status</Th><Th>Sales</Th><Th>Commission</Th><Th>Payment</Th><Th>Action</Th></tr></thead><tbody>
          {filteredOrders.map((order) => <tr key={order.id} className="group"><Td><div className="min-w-[130px]"><p className="font-semibold">{order.referrerName || "Unknown"}</p><p className="text-xs text-foreground/40">{order.referralCode || "-"}</p></div></Td><Td><span className="font-medium">{order.orderNumber || order.id.slice(-8)}</span></Td><Td><div><p className="font-medium">{order.customerName}</p><p className="text-xs text-foreground/40">{order.phoneNumber || "No phone"}</p></div></Td><Td><StatusBadge status={order.status} /></Td><Td>{formatPeso(order.orderTotal)}</Td><Td><div><p className="font-semibold">{formatPeso(order.commissionAmount)}</p><p className="text-xs text-foreground/40">{order.commissionPercentage}%</p></div></Td><Td>{order.commissionPaidAt ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300"><CheckCircle2 size={14} />Paid</span> : <span className="text-xs font-semibold text-amber-300">Unpaid</span>}</Td><Td><Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => openOrder(order)}>View</Button></Td></tr>)}
          {!filteredOrders.length ? <tr><Td colSpan={8}><div className="py-12 text-center"><p className="font-semibold">No referral orders found</p><p className="mt-1 text-sm text-foreground/45">Try changing your search or filters.</p></div></Td></tr> : null}
        </tbody></Table></div>
      </Card>

      <a href="/referral-chat" className="fixed bottom-6 right-6 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-xl transition hover:scale-[1.02]"><MessageCircle size={18} />Referral Chat</a>

      {selectedOrder ? <div className="fixed inset-0 z-50 flex justify-end bg-black/55" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedOrder(null); }}><aside className="h-full w-full max-w-lg overflow-y-auto border-l border-line bg-background p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent">Order Details</p><h2 className="mt-1 text-2xl font-semibold">{selectedOrder.orderNumber || selectedOrder.id.slice(-8)}</h2><p className="mt-1 text-sm text-foreground/45">{selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString() : ""}</p></div><button type="button" className="rounded-lg p-2 text-foreground/50 hover:bg-white/[0.06] hover:text-foreground" onClick={() => setSelectedOrder(null)} aria-label="Close"><X size={20} /></button></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2"><Detail label="Referral Partner" value={selectedOrder.referrerName || "Unknown"} /><Detail label="Referral Code" value={selectedOrder.referralCode || "-"} /><Detail label="Customer" value={selectedOrder.customerName} /><Detail label="Phone" value={selectedOrder.phoneNumber || "-"} /><Detail label="Order Status" value={formatStatus(selectedOrder.status)} /><Detail label="Order Total" value={formatPeso(selectedOrder.orderTotal)} /></div>
        <div className="mt-6 rounded-xl border border-line bg-black/[0.04] p-5"><div className="flex items-center gap-2"><WalletCards size={18} className="text-accent" /><h3 className="font-semibold">Commission</h3></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Detail label="Commission Amount" value={formatPeso(selectedOrder.commissionAmount)} /><Detail label="Payment Status" value={selectedOrder.commissionPaidAt ? "Paid" : "Unpaid"} /></div><label className="mt-5 block text-sm font-medium">Commission percentage</label><div className="mt-2 flex gap-2"><Input type="number" min="0" max="100" step="0.1" value={commissionDraft} onChange={(event) => setCommissionDraft(event.target.value)} /><Button type="button" onClick={() => void saveCommission()} disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : null}Save</Button></div><Button type="button" className="mt-3 w-full" disabled={saving || Boolean(selectedOrder.commissionPaidAt)} onClick={() => void markPaid()}><CheckCircle2 size={16} />{selectedOrder.commissionPaidAt ? "Commission Paid" : "Mark Commission Paid"}</Button></div>
        <div className="mt-6 flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => window.location.assign(`/referral-chat?partner=${encodeURIComponent(selectedOrder.referralCode || "")}`)}><MessageCircle size={16} />Chat with Partner</Button><a href={`/orders?search=${encodeURIComponent(selectedOrder.orderNumber || selectedOrder.id)}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white/[0.05] px-4 text-sm font-semibold hover:bg-white/[0.09]"><ExternalLink size={16} />Open Order</a></div>
      </aside></div> : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) { return <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-foreground/45">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></Card>; }
function MiniStat({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-line bg-background/30 px-4 py-3"><p className="text-xs text-foreground/45">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-line bg-black/[0.03] p-3"><p className="text-xs text-foreground/40">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
function StatusBadge({ status }: { status: string }) { return <span className="inline-flex rounded-full border border-line px-2.5 py-1 text-xs font-semibold">{formatStatus(status)}</span>; }
function formatPeso(value: number) { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(Number(value || 0)); }
function formatStatus(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
