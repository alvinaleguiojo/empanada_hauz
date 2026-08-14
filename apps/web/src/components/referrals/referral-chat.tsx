"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type Message = { id: string; senderType: string; senderName: string; content: string; createdAt: string };
type Conversation = { id: string; lastMessage?: string | null; participant?: { name: string; email: string } | null; unreadCount?: number };

export function ReferralChat({ mode, tokenStorageKey }: { mode: "partner" | "admin"; tokenStorageKey: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const token = typeof window === "undefined" ? undefined : window.localStorage.getItem(tokenStorageKey) ?? undefined;
  const selected = useMemo(() => conversations.find((item) => item.id === selectedId), [conversations, selectedId]);
  const base = mode === "admin" ? "/referrals/chat/admin" : "/referrals/chat";

  useEffect(() => { void loadConversations(); const timer = window.setInterval(() => void loadConversations(true), 4000); return () => window.clearInterval(timer); }, [mode, tokenStorageKey]);
  useEffect(() => { if (!selectedId) return; void loadMessages(selectedId); const timer = window.setInterval(() => void loadMessages(selectedId, true), 2500); void markRead(selectedId); return () => window.clearInterval(timer); }, [selectedId]);

  async function loadConversations(silent = false) {
    if (!silent) setLoading(true);
    try {
      const result = mode === "admin" ? await apiFetch<Conversation[]>("/referrals/chat/admin/conversations", undefined, token) : [await apiFetch<Conversation>("/referrals/chat/partner", undefined, token)];
      setConversations(result); if (!selectedId && result[0]) setSelectedId(result[0].id);
    } catch (err) { if (!silent) setError(err instanceof Error ? err.message : "Unable to load chat."); }
    finally { if (!silent) setLoading(false); }
  }
  async function loadMessages(id: string, silent = false) {
    try { setMessages(await apiFetch<Message[]>(`${base}/${id}/messages`, undefined, token)); if (!silent) setError(""); }
    catch (err) { if (!silent) setError(err instanceof Error ? err.message : "Unable to load messages."); }
  }
  async function markRead(id: string) { await apiFetch(`${base}/${id}/read`, { method: "PATCH" }, token).catch(() => undefined); }
  async function send() {
    const content = draft.trim(); if (!content || !selectedId || sending) return; setSending(true);
    try { const message = await apiFetch<Message>(`${base}/${selectedId}/messages`, { method: "POST", body: JSON.stringify({ content }) }, token); setMessages((current) => [...current, message]); setDraft(""); await loadConversations(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to send message."); }
    finally { setSending(false); }
  }

  return <Card className="overflow-hidden p-0"><div className="grid min-h-[620px] md:grid-cols-[300px_minmax(0,1fr)]">
    <aside className="border-b border-line bg-black/10 md:border-b-0 md:border-r"><div className="border-b border-line px-4 py-4"><div className="flex items-center gap-2"><MessageCircle size={18} className="text-accent"/><h2 className="font-semibold">Referral Chats</h2></div><p className="mt-1 text-xs text-foreground/45">{mode === "admin" ? "Messages from referral users" : "Chat with Empanada Hauz admin"}</p></div>
      <div className="max-h-[540px] overflow-y-auto">{loading ? <div className="flex justify-center p-8"><Loader2 className="animate-spin" size={20}/></div> : null}{!loading && !conversations.length ? <p className="p-6 text-sm text-foreground/45">No conversations yet.</p> : null}
        {conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} className={`w-full border-b border-line px-4 py-3 text-left ${conversation.id === selectedId ? "bg-accent/[0.08]" : "hover:bg-white/[0.04]"}`}><div className="flex gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"><UserRound size={16}/></div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="truncate text-sm font-semibold">{mode === "admin" ? conversation.participant?.name ?? "Referral user" : "Empanada Hauz Admin"}</p>{conversation.unreadCount ? <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-black">{conversation.unreadCount}</span> : null}</div><p className="mt-1 truncate text-xs text-foreground/45">{conversation.lastMessage ?? "Start a conversation"}</p></div></div></button>)}
      </div>
    </aside>
    <section className="flex min-h-[620px] flex-col"><div className="border-b border-line px-5 py-4"><p className="text-sm font-semibold">{mode === "admin" ? selected?.participant?.name ?? "Select a referral user" : "Empanada Hauz Admin"}</p><p className="text-xs text-foreground/45">{mode === "admin" ? selected?.participant?.email ?? "" : "Ask about referrals, commissions, approval, or payouts."}</p></div>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">{messages.map((message) => { const mine = mode === "admin" ? message.senderType === "admin" : message.senderType !== "admin"; return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${mine ? "rounded-br-md bg-accent text-black" : "rounded-bl-md bg-white/[0.07] text-foreground"}`}>{!mine ? <p className="mb-1 text-[11px] font-semibold opacity-60">{message.senderName}</p> : null}<p className="whitespace-pre-wrap break-words">{message.content}</p><p className="mt-1 text-[10px] opacity-50">{new Date(message.createdAt).toLocaleString()}</p></div></div>; })}</div>
      <div className="border-t border-line p-4">{error ? <p className="mb-2 text-xs text-danger">{error}</p> : null}<div className="flex gap-2"><Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void send(); } }} placeholder="Type a message..." disabled={!selectedId || sending}/><Button type="button" onClick={() => void send()} disabled={!selectedId || !draft.trim() || sending}>{sending ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} Send</Button></div></div>
    </section>
  </div></Card>;
}
