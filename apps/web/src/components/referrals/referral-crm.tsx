"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, Search, Send, TicketPercent, UserRound, UsersRound, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import type { ReferralPartnersPage, ReferralsOverview } from "./referrals-dashboard";

type Referral = ReferralsOverview["referrals"][number];
type Conversation = {
  id: string;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  participant?: { id: string; name: string; email: string; referralCode?: string | null } | null;
  unreadCount?: number;
};
type Message = { id: string; senderType: string; senderName: string; content: string; createdAt: string };

type ReferralCrmProps = { initialData: ReferralsOverview; initialPartners: ReferralPartnersPage };

export function ReferralCrm({ initialData, initialPartners }: ReferralCrmProps) {
  const [data, setData] = useState(initialData);
  const [partners] = useState(initialPartners.items);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState(initialPartners.items[0]?.id ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [commissionDrafts, setCommissionDrafts] = useState<Record<string, string>>({});
  const [updatingReferralId, setUpdatingReferralId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(true);
  const messagesRequestId = useRef(0);

  const selectedPartner = useMemo(() => partners.find((partner) => partner.id === selectedPartnerId) ?? null, [partners, selectedPartnerId]);
  const partnerReferrals = useMemo(() => {
    if (!selectedPartner) return data.referrals;
    return data.referrals.filter((referral) => referral.referralCode === selectedPartner.referralCode || referral.referrerName === selectedPartner.name);
  }, [data.referrals, selectedPartner]);
  const filteredPartners = useMemo(() => {
    const query = partnerSearch.trim().toLowerCase();
    if (!query) return partners;
    return partners.filter((partner) => partner.name.toLowerCase().includes(query) || partner.email.toLowerCase().includes(query) || partner.referralCode.toLowerCase().includes(query) || (partner.phoneNumber ?? "").includes(query));
  }, [partners, partnerSearch]);
  const filteredOrders = useMemo(() => {
    const query = orderSearch.trim().toLowerCase();
    return partnerReferrals.filter((referral) => {
      const statusMatches = statusFilter === "all" || referral.status === statusFilter;
      const paymentMatches = paymentFilter === "all" || (paymentFilter === "paid" ? Boolean(referral.commissionPaidAt) : !referral.commissionPaidAt);
      const searchMatches = !query || referral.customerName.toLowerCase().includes(query) || (referral.orderNumber ?? "").toLowerCase().includes(query) || (referral.phoneNumber ?? "").includes(query);
      return statusMatches && paymentMatches && searchMatches;
    });
  }, [orderSearch, partnerReferrals, paymentFilter, statusFilter]);
  const selectedConversation = useMemo(() => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null, [conversations, selectedConversationId]);
  const selectedPartnerConversation = useMemo(() => {
    if (!selectedPartner) return null;
    return conversations.find((conversation) => conversation.participant?.id === selectedPartner.id || conversation.participant?.referralCode === selectedPartner.referralCode) ?? null;
  }, [conversations, selectedPartner]);
  const unreadTotal = conversations.reduce((sum, conversation) => sum + (conversation.unreadCount ?? 0), 0);
  const statuses = Array.from(new Set(data.referrals.map((referral) => referral.status))).filter(Boolean);

  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(() => void loadConversations(true), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const conversation = selectedPartnerConversation;
    setSelectedConversationId((current) => {
      if (current && conversations.some((item) => item.id === current)) return current;
      return conversation?.id ?? "";
    });
  }, [conversations, selectedPartnerConversation]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedConversationId);
    const timer = window.setInterval(() => void loadMessages(selectedConversationId, true), 2500);
    void markRead(selectedConversationId);
    return () => window.clearInterval(timer);
  }, [selectedConversationId]);

  async function loadConversations(silent = false) {
    if (!silent) setChatLoading(true);
    try {
      const result = await apiFetch<Conversation[]>("/referrals/chat/admin/conversations");
      setConversations(result);
      setSelectedConversationId((current) => {
        if (current && result.some((conversation) => conversation.id === current)) return current;
        return result[0]?.id ?? "";
      });
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Unable to load referral chats.");
    } finally {
      if (!silent) setChatLoading(false);
    }
  }

  async function loadMessages(id: string, silent = false) {
    const requestId = ++messagesRequestId.current;
    try {
      const result = await apiFetch<Message[]>(`/referrals/chat/admin/${id}/messages`);
      if (requestId !== messagesRequestId.current || id !== selectedConversationId) return;
      setMessages(result);
      if (!silent) setError("");
    } catch (err) {
      if (requestId !== messagesRequestId.current || id !== selectedConversationId) return;
      if (!silent) setError(err instanceof Error ? err.message : "Unable to load messages.");
    }
  }

  async function markRead(id: string) {
    await apiFetch(`/referrals/chat/admin/${id}/read`, { method: "PATCH" }).catch(() => undefined);
    setConversations((current) => current.map((conversation) => conversation.id === id ? { ...conversation, unreadCount: 0 } : conversation));
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || !selectedConversationId || sending) return;
    setSending(true);
    try {
      const message = await apiFetch<Message>(`/referrals/chat/admin/${selectedConversationId}/messages`, { method: "POST", body: JSON.stringify({ content }) });
      setMessages((current) => [...current, message]);
      setDraft("");
      await loadConversations(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  async function refreshOrders() {
    setLoading(true);
    setError("");
    try {
      const all = await apiFetch<{ totalReferrals: number; uniqueCustomers: number; totalRevenue: number; unpaidCommission?: number; paidCommission?: number; referrals: Referral[] }>("/referrals/all");
      setData((current) => ({ ...current, ...all }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh referral orders.");
    } finally {
      setLoading(false);
    }
  }

  async function updateCommission(referral: Referral) {
    const percentage = Number(commissionDrafts[referral.id] ?? referral.commissionPercentage ?? 0);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      setError("Commission percentage must be between 0 and 100.");
      return;
    }
    setUpdatingReferralId(referral.id);
    try {
      const updated = await apiFetch<Referral>(`/referrals/${referral.id}/commission`, { method: "PATCH", body: JSON.stringify({ commissionPercentage: percentage }) });
      setData((current) => ({ ...current, referrals: current.referrals.map((item) => item.id === updated.id ? updated : item) }));
      setCommissionDrafts((current) => ({ ...current, [referral.id]: String(updated.commissionPercentage) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update commission.");
    } finally {
      setUpdatingReferralId(null);
    }
  }

  async function markPaid(referral: Referral) {
    setUpdatingReferralId(referral.id);
    try {
      const updated = await apiFetch<Referral>(`/referrals/${referral.id}/paid`, { method: "PATCH" });
      setData((current) => ({ ...current, referrals: current.referrals.map((item) => item.id === updated.id ? updated : item) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark commission paid.");
    } finally {
      setUpdatingReferralId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <CrmMetric icon={UsersRound} label="Partners" value={String(partners.length)} hint={`${initialPartners.pagination.pendingCount} pending approval`} />
        <CrmMetric icon={TicketPercent} label="Referral Orders" value={String(data.totalReferrals)} hint="Attributed orders" />
        <CrmMetric icon={WalletCards} label="Sales" value={formatPeso(data.totalRevenue)} hint="Referral revenue" />
        <CrmMetric icon={WalletCards} label="Unpaid" value={formatPeso(data.unpaidCommission ?? 0)} hint="Commission due" />
        <CrmMetric icon={MessageCircle} label="Unread Chats" value={String(unreadTotal)} hint="Messages waiting" />
      </div>

      {error ? <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div> : null}

      <Card className="overflow-hidden p-0">
        <div className="grid min-h-[720px] xl:grid-cols-[270px_minmax(0,1fr)_360px]">
          <aside className="border-b border-line bg-black/10 xl:border-b-0 xl:border-r">
            <div className="border-b border-line p-4">
              <div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold">Referral Partners</h2><p className="mt-1 text-xs text-foreground/45">Select a partner to manage orders.</p></div><span className="rounded-full bg-accent/10 px-2 py-1 text-[10px] font-bold text-accent">{partners.length}</span></div>
              <div className="relative mt-3"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" /><Input value={partnerSearch} onChange={(event) => setPartnerSearch(event.target.value)} placeholder="Search partners" className="pl-9" /></div>
            </div>
            <div className="max-h-[650px] overflow-y-auto">
              {filteredPartners.map((partner) => {
                const conversation = conversations.find((item) => item.participant?.id === partner.id || item.participant?.referralCode === partner.referralCode);
                const active = partner.id === selectedPartnerId;
                return <button key={partner.id} type="button" onClick={() => setSelectedPartnerId(partner.id)} className={`w-full border-b border-line px-4 py-3 text-left transition ${active ? "bg-accent/[0.08]" : "hover:bg-white/[0.04]"}`}><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"><UserRound size={16} /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{partner.name}</p>{conversation?.unreadCount ? <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">{conversation.unreadCount}</span> : null}</div><p className="mt-0.5 truncate text-[11px] text-foreground/45">{partner.referralCode}</p><p className="mt-1 text-[10px] text-foreground/35">{partner.approvalStatus === "approved" ? "Approved" : "Pending"}</p></div></div></button>;
              })}
              {!filteredPartners.length ? <p className="p-5 text-sm text-foreground/45">No matching partners.</p> : null}
            </div>
          </aside>

          <section className="min-w-0">
            <div className="border-b border-line p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-lg font-semibold">{selectedPartner?.name ?? "All Referral Orders"}</h2>{selectedPartner ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${selectedPartner.approvalStatus === "approved" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>{selectedPartner.approvalStatus}</span> : null}</div>{selectedPartner ? <p className="mt-1 text-xs text-foreground/45">{selectedPartner.email} · {selectedPartner.referralCode}</p> : null}</div><div className="flex flex-wrap gap-2"><Input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Search orders" className="w-[180px]" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-line bg-black/15 px-3 text-sm text-foreground outline-none"><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select><select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="h-10 rounded-lg border border-line bg-black/15 px-3 text-sm text-foreground outline-none"><option value="all">All payments</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option></select><Button type="button" variant="secondary" onClick={() => void refreshOrders()} disabled={loading}>{loading ? <Loader2 size={15} className="animate-spin" /> : null}Refresh</Button></div></div>
            </div>
            <div className="grid gap-3 border-b border-line bg-black/[0.04] p-4 sm:grid-cols-3"><MiniStat label="Orders" value={String(partnerReferrals.length)} /><MiniStat label="Sales" value={formatPeso(partnerReferrals.reduce((sum, item) => sum + Number(item.orderTotal ?? 0), 0))} /><MiniStat label="Commission" value={formatPeso(partnerReferrals.reduce((sum, item) => sum + Number(item.commissionAmount ?? 0), 0))} /></div>
            <div className="overflow-x-auto"><Table><thead><tr><Th>Date</Th><Th>Customer</Th><Th>Order</Th><Th>Status</Th><Th>Total</Th><Th>Commission</Th><Th>Paid</Th><Th>Actions</Th></tr></thead><tbody>
              {filteredOrders.map((referral) => {
                const updating = updatingReferralId === referral.id;
                const percentage = commissionDrafts[referral.id] ?? String(referral.commissionPercentage ?? 0);
                return <tr key={referral.id}><Td>{formatDate(referral.createdAt)}</Td><Td><p className="font-medium">{referral.customerName}</p>{referral.phoneNumber ? <p className="text-[10px] text-foreground/40">{referral.phoneNumber}</p> : null}</Td><Td>{referral.orderNumber ?? "Pending"}</Td><Td>{formatStatus(referral.status)}</Td><Td>{formatPeso(referral.orderTotal)}</Td><Td><div className="min-w-[115px]"><p className="font-semibold">{formatPeso(referral.commissionAmount)}</p><p className="text-[10px] text-foreground/40">{Number(referral.commissionPercentage)}%</p></div></Td><Td>{referral.commissionPaidAt ? formatDate(referral.commissionPaidAt) : <span className="text-amber-300">Unpaid</span>}</Td><Td><div className="flex min-w-[205px] items-center gap-2"><input type="number" min="0" max="100" step="0.01" value={percentage} onChange={(event) => setCommissionDrafts((current) => ({ ...current, [referral.id]: event.target.value }))} className="h-8 w-16 rounded-md border border-line bg-black/15 px-2 text-xs text-foreground outline-none" aria-label="Commission percentage" /><Button type="button" variant="secondary" className="h-8 px-2 text-xs" disabled={updating} onClick={() => void updateCommission(referral)}>Set %</Button><Button type="button" className="h-8 px-2 text-xs" disabled={updating || Boolean(referral.commissionPaidAt)} onClick={() => void markPaid(referral)}>{updating ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}Paid</Button></div></Td></tr>;
              })}
              {!filteredOrders.length ? <tr><Td colSpan={8}><span className="text-foreground/45">No referral orders match the current filters.</span></Td></tr> : null}
            </tbody></Table></div>
          </section>

          <aside className="flex min-h-[520px] flex-col border-t border-line xl:border-l xl:border-t-0">
            <div className="border-b border-line p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><MessageCircle size={18} className="text-accent" /><div><h2 className="font-semibold">Referral Chat</h2><p className="text-[10px] text-foreground/40">{selectedConversation?.participant?.name ?? "Select a partner conversation"}</p></div></div>{selectedConversation?.unreadCount ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">{selectedConversation.unreadCount}</span> : null}</div></div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-black/[0.04] p-4">
              {chatLoading && !conversations.length ? <div className="flex h-full items-center justify-center"><Loader2 size={20} className="animate-spin text-accent" /></div> : null}
              {!chatLoading && !selectedConversation ? <div className="flex h-full flex-col items-center justify-center text-center text-foreground/35"><MessageCircle size={28} className="mb-3" /><p className="text-sm font-medium">No chat yet</p><p className="mt-1 max-w-[230px] text-xs">The referral partner needs to start the conversation before an admin can reply here.</p></div> : null}
              {messages.map((message) => { const mine = message.senderType === "admin"; return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-3 py-2 text-xs ${mine ? "rounded-br-md bg-accent text-black" : "rounded-bl-md bg-white/[0.07] text-foreground"}`}><p className="whitespace-pre-wrap break-words">{message.content}</p><p className="mt-1 text-[9px] opacity-45">{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p></div></div>; })}
            </div>
            <div className="border-t border-line p-3"><div className="flex gap-2"><Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void sendMessage(); } }} placeholder="Reply to referral partner..." disabled={!selectedConversationId || sending} /><Button type="button" onClick={() => void sendMessage()} disabled={!selectedConversationId || !draft.trim() || sending}>{sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Send</Button></div></div>
          </aside>
        </div>
      </Card>
    </div>
  );
}

function CrmMetric({ icon: Icon, label, value, hint }: { icon: typeof TicketPercent; label: string; value: string; hint: string }) {
  return <Card className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/42">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-sm text-foreground/48">{hint}</p></div><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line/80 bg-black/10 text-foreground/65"><Icon size={19} /></div></div></Card>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-line bg-black/10 px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/38">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

function formatPeso(value: number) { return `Php ${Number(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function formatDate(value?: string | null) { if (!value) return "-"; return new Date(value).toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" }); }
function formatStatus(value: string) { return value ? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "-"; }
