"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2, MessageCircle, Search, Send, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { socket } from "@/lib/socket";

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
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const messagesRequestId = useRef(0);
  const lastSeenRef = useRef("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => conversations.find((item) => item.id === selectedId), [conversations, selectedId]);
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      `${conversation.customer.name} ${conversation.lastMessage ?? ""}`.toLowerCase().includes(query),
    );
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
    return () => socket.off("notifications.created", handleNotification);
  }, [open, selectedId]);

  useEffect(() => {
    if (!open) return;
    setUnread(0);
    window.setTimeout(() => bottomRef.current?.scrollIntoView({ block: "end" }), 50);
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  async function loadConversations(silent = false) {
    try {
      const result = await apiFetch<Conversation[]>("/messenger/conversations");
      setConversations(result);
      setSelectedId((current) =>
        current && result.some((conversation) => conversation.id === current) ? current : result[0]?.id ?? "",
      );
      const newest = result[0]?.updatedAt ?? "";
      if (lastSeenRef.current && newest > lastSeenRef.current && !open) setUnread((count) => Math.max(count, 1));
      lastSeenRef.current = newest;
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Unable to load conversations.");
    }
  }

  async function loadMessages(id: string, silent = false) {
    const requestId = ++messagesRequestId.current;
    if (!silent) setLoadingMessages(true);
    try {
      const result = await apiFetch<Message[]>(`/messenger/conversations/${id}/messages`);
      if (requestId !== messagesRequestId.current || id !== selectedId) return;
      setMessages(result);
      if (!silent) setError("");
    } catch (err) {
      if (!silent && requestId === messagesRequestId.current && id === selectedId) {
        setError(err instanceof Error ? err.message : "Unable to load messages.");
      }
    } finally {
      if (!silent && requestId === messagesRequestId.current) setLoadingMessages(false);
    }
  }

  async function send() {
    const text = draft.trim();
    const psid = selected?.customer.messengerPsid;
    if (!text || !psid || sending) return;
    setSending(true);
    setError("");
    try {
      await apiFetch("/messenger/send", { method: "POST", body: JSON.stringify({ recipientPsid: psid, text }) });
      setDraft("");
      await loadMessages(selectedId, true);
      await loadConversations(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  const content = (
    <div className="pointer-events-none fixed bottom-6 right-4 z-[9999] sm:right-6">
      <div className="pointer-events-auto flex flex-col items-end gap-3">
        {open ? (
          <div className="flex h-[min(650px,calc(100dvh-120px))] w-[min(640px,calc(100vw-24px))] overflow-hidden rounded-xl border border-line bg-background shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <aside className="flex w-[220px] shrink-0 flex-col border-r border-line bg-black/[0.02]">
              <div className="border-b border-line px-3 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent"><MessageCircle size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Messenger</p>
                    <p className="text-[10px] text-foreground/45">{conversations.length} conversations</p>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/45 transition hover:bg-foreground/5 hover:text-foreground" aria-label="Close Messenger"><X size={17} /></button>
                </div>
                <div className="relative mt-3">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground/35" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations..." className="h-9 pl-8 text-xs" />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {filteredConversations.map((conversation) => {
                  const active = conversation.id === selectedId;
                  return (
                    <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} className={`group w-full border-b border-line/70 px-3 py-3 text-left transition-colors ${active ? "bg-accent/[0.09]" : "hover:bg-foreground/[0.035]"}`}>
                      <div className="flex gap-2.5">
                        <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${active ? "bg-accent/15 text-accent" : "bg-foreground/5 text-foreground/50"}`}><UserRound size={15} /></div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">{conversation.customer.name}</p>
                          <p className="mt-1 truncate text-[10px] text-foreground/45">{conversation.lastMessage ?? "Start a conversation"}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col bg-background">
              <header className="flex shrink-0 items-center gap-2.5 border-b border-line px-3.5 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"><UserRound size={16} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{selected?.customer.name ?? "Select a conversation"}</p>
                  <p className="truncate text-[10px] text-foreground/45">{selected?.customer.phoneNumber ?? selected?.customer.messengerPsid ?? ""}{selected?.customer.totalOrders ? ` · ${selected.customer.totalOrders} orders` : ""}</p>
                </div>
                {selected?.customer.isVip ? <span className="rounded-full bg-accent px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-black">VIP</span> : null}
              </header>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3.5">
                {loadingMessages ? <div className="flex justify-center p-8"><Loader2 className="animate-spin text-foreground/40" size={20} /></div> : null}
                {!loadingMessages && !messages.length ? <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center"><span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent"><MessageCircle size={21} /></span><p className="text-sm font-medium">No messages yet</p><p className="mt-1 text-xs text-foreground/45">Send a message to start the conversation.</p></div> : null}
                {messages.map((message) => {
                  const mine = message.direction === "outbound";
                  return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm ${mine ? "rounded-br-md bg-accent text-black" : "rounded-bl-md bg-foreground/[0.07] text-foreground"}`}><p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p><p className="mt-1.5 text-[9px] opacity-50">{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p></div></div>;
                })}
                <div ref={bottomRef} />
              </div>

              <div className="shrink-0 border-t border-line bg-background/95 p-3 backdrop-blur">
                {error ? <p className="mb-2 px-1 text-xs text-danger">{error}</p> : null}
                <div className="flex items-end gap-2">
                  <Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={selected ? "Reply to this customer..." : "Select a conversation..."} disabled={!selected?.customer.messengerPsid || sending} className="h-11 min-w-0" />
                  <Button type="button" onClick={() => void send()} disabled={!draft.trim() || !selected?.customer.messengerPsid || sending} className="h-11 shrink-0 px-3" aria-label="Send message">{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}<span>Send</span></Button>
                </div>
                <p className="mt-1.5 px-1 text-[10px] text-foreground/30">Press Enter to send</p>
              </div>
            </section>
          </div>
        ) : null}

        <div className="flex items-center gap-3 sm:gap-4">
          <button type="button" onClick={() => setOpen((value) => !value)} className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.16] bg-accent text-black shadow-[0_16px_40px_rgba(0,0,0,0.4)] transition hover:scale-105 hover:brightness-110" aria-label="Open Messenger" title="Messenger">
            {open ? <ChevronDown size={20} /> : <MessageCircle size={21} />}
            {!open && unread > 0 ? <span className="absolute -right-0.5 -top-0.5 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#0f1726] bg-danger px-1 text-[9px] font-bold text-white">{unread > 99 ? "99+" : unread}</span> : null}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(content, document.body);
}

function isMessengerNotification(payload: unknown): payload is { conversationId?: string } {
  return Boolean(payload && typeof payload === "object" && (payload as Record<string, unknown>).type === "messenger.message_received");
}
