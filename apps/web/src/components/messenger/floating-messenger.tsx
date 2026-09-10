"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bold, ChevronDown, Italic, Link, List, Loader2, MessageCircle, Search, Send, Strikethrough, UserRound, X } from "lucide-react";
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

type MessengerNotification = {
  conversationId?: string;
  senderId?: string;
  messageId?: string;
  message?: string;
  createdAt?: string;
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
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

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
    const handleNotification = (eventPayload: unknown) => {
      const payload = getMessengerNotificationPayload(eventPayload);
      if (!payload) return;
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

  function applyFormatting(prefix: string, suffix = prefix) {
    const input = composerRef.current;
    if (!input) return;
    const start = input.selectionStart ?? draft.length;
    const end = input.selectionEnd ?? draft.length;
    const selectedText = draft.slice(start, end);
    const replacement = `${prefix}${selectedText || "text"}${suffix}`;
    const nextDraft = `${draft.slice(0, start)}${replacement}${draft.slice(end)}`;
    setDraft(nextDraft);
    requestAnimationFrame(() => {
      input.focus();
      const selectionStart = start + prefix.length;
      const selectionEnd = selectionStart + (selectedText || "text").length;
      input.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function insertBulletList() {
    const input = composerRef.current;
    if (!input) return;
    const start = input.selectionStart ?? draft.length;
    const end = input.selectionEnd ?? draft.length;
    const selectedText = draft.slice(start, end) || "item";
    const replacement = selectedText
      .split("\n")
      .map((line) => `• ${line}`)
      .join("\n");
    setDraft(`${draft.slice(0, start)}${replacement}${draft.slice(end)}`);
    requestAnimationFrame(() => input.focus());
  }

  function insertLink() {
    const input = composerRef.current;
    if (!input) return;
    const start = input.selectionStart ?? draft.length;
    const end = input.selectionEnd ?? draft.length;
    const selectedText = draft.slice(start, end) || "link text";
    const replacement = `[${selectedText}](https://)`;
    setDraft(`${draft.slice(0, start)}${replacement}${draft.slice(end)}`);
    requestAnimationFrame(() => {
      input.focus();
      const urlStart = start + selectedText.length + 3;
      input.setSelectionRange(urlStart, urlStart + 8);
    });
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
    <div className="pointer-events-none fixed inset-0 z-[9999]">
      <div className="pointer-events-auto fixed bottom-3 left-[164px] flex flex-col items-start sm:left-[172px]">
        {open ? (
          <div className="mb-2 flex h-[min(650px,calc(100dvh-88px))] w-[min(640px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-line bg-background shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
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
                <div className="mb-2 flex items-center gap-1 rounded-lg border border-line bg-foreground/[0.025] p-1">
                  <FormatButton label="Bold" onClick={() => applyFormatting("**")}><Bold size={14} /></FormatButton>
                  <FormatButton label="Italic" onClick={() => applyFormatting("*", "*")}><Italic size={14} /></FormatButton>
                  <FormatButton label="Strikethrough" onClick={() => applyFormatting("~~")}><Strikethrough size={14} /></FormatButton>
                  <FormatButton label="Bulleted list" onClick={insertBulletList}><List size={14} /></FormatButton>
                  <FormatButton label="Insert link" onClick={insertLink}><Link size={14} /></FormatButton>
                  <span className="ml-auto px-1 text-[9px] text-foreground/30">Markdown formatting</span>
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    ref={composerRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}
                    placeholder={selected ? "Reply to this customer..." : "Select a conversation..."}
                    disabled={!selected?.customer.messengerPsid || sending}
                    rows={2}
                    className="min-h-11 max-h-32 min-w-0 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2.5 text-sm shadow-sm outline-none placeholder:text-foreground/40 focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Button type="button" onClick={() => void send()} disabled={!draft.trim() || !selected?.customer.messengerPsid || sending} className="h-11 shrink-0 px-3" aria-label="Send message">{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}<span>Send</span></Button>
                </div>
                <p className="mt-1.5 px-1 text-[10px] text-foreground/30">Enter to send · Shift+Enter for a new line</p>
              </div>
            </section>
          </div>
        ) : null}

        <div className="flex items-center gap-3 sm:gap-4">
          <button type="button" onClick={() => setOpen((value) => !value)} className="relative inline-flex h-11 min-w-[132px] items-center justify-center gap-2 rounded-xl border border-white/[0.16] bg-accent px-4 text-sm font-semibold text-black shadow-[0_14px_34px_rgba(0,0,0,0.32)] transition hover:-translate-y-0.5 hover:brightness-110" aria-label="Open Messenger" title="Messenger">
            {open ? <ChevronDown size={18} /> : <MessageCircle size={18} />}
            <span>Messenger</span>
            {!open && unread > 0 ? <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full border-2 border-[#0f1726] bg-danger px-1 text-[9px] font-bold text-white">{unread > 99 ? "99+" : unread}</span> : null}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(content, document.body);
}

function FormatButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/50 transition hover:bg-foreground/10 hover:text-foreground">{children}</button>;
}

function getMessengerNotificationPayload(payload: unknown): MessengerNotification | null {
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload as Record<string, unknown>;
  if (envelope.type !== "messenger.message_received" || !envelope.payload || typeof envelope.payload !== "object") return null;
  return envelope.payload as MessengerNotification;
}
