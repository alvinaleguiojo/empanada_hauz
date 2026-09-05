"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2, MessageCircle, Search, Send, UserRound, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { socket } from "@/lib/socket";
import { Input } from "@/components/ui/input";

type Customer = {
  id: string;
  name: string;
  phoneNumber?: string | null;
  messengerPsid?: string | null;
  isVip?: boolean;
  totalOrders?: number;
};

type Conversation = {
  id: string;
  lastMessage?: string | null;
  updatedAt: string;
  customer: Customer;
};

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  createdAt: string;
};

export function FloatingMessenger() {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const lastSeenRef = useRef("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => conversations.find((item) => item.id === selectedId), [conversations, selectedId]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((item) => `${item.customer.name} ${item.lastMessage ?? ""}`.toLowerCase().includes(q));
  }, [conversations, search]);

  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(() => void loadConversations(true), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId);
    const timer = window.setInterval(() => void loadMessages(selectedId, true), 3000);
    return () => window.clearInterval(timer);
  }, [selectedId]);

  useEffect(() => {
    const handleNotification = (payload: unknown) => {
      if (!isMessengerNotification(payload)) return;
      if (!open) setUnread((count) => count + 1);
      void loadConversations(true);
      if (payload.conversationId === selectedId) void loadMessages(selectedId, true);
    };

    socket.on("notifications.created", handleNotification);
    return () => {
      socket.off("notifications.created", handleNotification);
    };
  }, [open, selectedId]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ block: "end" }), 50);
    }
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  async function loadConversations(silent = false) {
    try {
      const result = await apiFetch<Conversation[]>("/messenger/conversations");
      setConversations(result);
      setSelectedId((current) => current && result.some((item) => item.id === current) ? current : result[0]?.id ?? "");

      const newest = result[0]?.updatedAt ?? "";
      if (lastSeenRef.current && newest > lastSeenRef.current && !open) setUnread((count) => Math.max(count, 1));
      lastSeenRef.current = newest;
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Unable to load Messenger.");
    }
  }

  async function loadMessages(id: string, silent = false) {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const result = await apiFetch<Message[]>(`/messenger/conversations/${id}/messages`);
      if (id === selectedId) setMessages(result);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Unable to load messages.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function send() {
    const text = draft.trim();
    const psid = selected?.customer.messengerPsid;
    if (!text || !psid || sending) return;
    setSending(true);
    setError("");
    try {
      await apiFetch("/messenger/send", {
        method: "POST",
        body: JSON.stringify({ recipientPsid: psid, text })
      });
      setDraft("");
      await loadMessages(selectedId, true);
      await loadConversations(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  function chooseConversation(id: string) {
    setSelectedId(id);
    setError("");
  }

  const content = (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[9999] flex justify-end px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:px-0">
      <div className="pointer-events-auto flex flex-col items-end gap-3">
        {open ? (
          <div className="flex h-[min(560px,calc(100dvh-170px))] w-[min(390px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-white/[0.14] bg-[#0f1726] shadow-[0_24px_70px_rgba(0,0,0,0.5)]">
            <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.08] bg-[#131d2e] px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent"><MessageCircle size={18} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Messenger</p>
                <p className="text-[11px] text-foreground/45">Customer replies</p>
              </div>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] text-foreground/45">{conversations.length}</span>
              <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/55 hover:bg-white/[0.07] hover:text-foreground" aria-label="Close Messenger">
                <X size={17} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[138px_1fr]">
              <aside className="min-h-0 overflow-y-auto border-r border-white/[0.08] bg-[#0b1321]">
                <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#0b1321] p-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground/35" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="h-8 border-white/[0.08] bg-white/[0.03] pl-8 pr-2 text-xs" />
                  </div>
                </div>
                {filtered.map((conversation) => {
                  const active = conversation.id === selectedId;
                  return (
                    <button key={conversation.id} type="button" onClick={() => chooseConversation(conversation.id)} className={`w-full border-b border-white/[0.04] px-2.5 py-2.5 text-left transition ${active ? "bg-accent/[0.10]" : "hover:bg-white/[0.04]"}`}>
                      <div className="flex items-center gap-2">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${active ? "bg-accent/15 text-accent" : "bg-white/[0.06] text-foreground/45"}`}><UserRound size={14} /></div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">{conversation.customer.name}</p>
                          <p className="mt-0.5 truncate text-[10px] text-foreground/40">{conversation.lastMessage ?? "No messages"}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </aside>

              <section className="flex min-w-0 flex-col bg-[#0f1726]">
                <div className="shrink-0 border-b border-white/[0.08] bg-[#131d2e] px-3.5 py-3">
                  <p className="truncate text-sm font-semibold">{selected?.customer.name ?? "Select a customer"}</p>
                  <p className="truncate text-[10px] text-foreground/40">{selected?.customer.phoneNumber ?? selected?.customer.messengerPsid ?? "Messenger customer"}</p>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
                  {loading ? <div className="flex justify-center p-6"><Loader2 size={18} className="animate-spin text-foreground/40" /></div> : null}
                  {!loading && !messages.length ? <div className="flex h-full items-center justify-center px-4 text-center text-xs text-foreground/40">No messages yet.</div> : null}
                  {messages.map((message) => {
                    const mine = message.direction === "outbound";
                    return (
                      <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[84%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${mine ? "rounded-br-md bg-accent text-black" : "rounded-bl-md bg-white/[0.07] text-foreground"}`}>
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                          <p className="mt-1 text-[9px] opacity-45">{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {error ? <p className="px-3 pb-1 text-[10px] text-danger">{error}</p> : null}
                <div className="shrink-0 border-t border-white/[0.08] bg-[#131d2e] p-2.5">
                  <div className="flex items-center gap-2">
                    <Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={selected ? "Reply to customer..." : "Select a conversation"} disabled={!selected?.customer.messengerPsid || sending} className="h-10 min-w-0 border-white/[0.08] bg-white/[0.03] text-xs" />
                    <button type="button" onClick={() => void send()} disabled={!draft.trim() || !selected?.customer.messengerPsid || sending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-black transition hover:brightness-110 disabled:opacity-40" aria-label="Send reply">
                      {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        <button type="button" onClick={() => setOpen((value) => !value)} className="relative mb-20 inline-flex h-12 items-center gap-2 rounded-full border border-white/[0.14] bg-accent px-4 text-sm font-semibold text-black shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition hover:scale-[1.02] hover:brightness-110" aria-label="Open Messenger" title="Messenger">
          {open ? <ChevronDown size={18} /> : <MessageCircle size={18} />}
          <span>Messenger</span>
          {!open && unread > 0 ? <span className="ml-0.5 flex min-h-5 min-w-5 items-center justify-center rounded-full border border-black/15 bg-danger px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span> : null}
        </button>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(content, document.body);
}

function isMessengerNotification(payload: unknown): payload is { conversationId?: string } {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      (payload as Record<string, unknown>).type === "messenger.message_received"
  );
}
