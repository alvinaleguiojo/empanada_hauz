"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageCircle, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

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
  aiIntent?: string | null;
  createdAt: string;
};

export function InboxList({ initialConversations }: { initialConversations: Conversation[] }) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState(initialConversations[0]?.id ?? "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesRequestId = useRef(0);

  const selected = useMemo(
    () => conversations.find((item) => item.id === selectedId),
    [conversations, selectedId]
  );

  useEffect(() => {
    const timer = window.setInterval(() => void loadConversations(true), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId);
    const timer = window.setInterval(() => void loadMessages(selectedId, true), 3000);
    return () => window.clearInterval(timer);
  }, [selectedId]);

  async function loadConversations(silent = false) {
    try {
      const result = await apiFetch<Conversation[]>("/messenger/conversations");
      setConversations(result);
      setSelectedId((current) => {
        if (current && result.some((conversation) => conversation.id === current)) return current;
        return result[0]?.id ?? "";
      });
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
      if (requestId !== messagesRequestId.current || id !== selectedId) return;
      if (!silent) setError(err instanceof Error ? err.message : "Unable to load messages.");
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }

  async function send() {
    const text = draft.trim();
    const psid = selected?.customer.messengerPsid;
    if (!text || !psid || sending) return;
    setSending(true);
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

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid min-h-[620px] md:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-b border-line bg-black/10 md:border-b-0 md:border-r">
          <div className="border-b border-line px-4 py-4">
            <div className="flex items-center gap-2">
              <MessageCircle size={18} className="text-accent" />
              <h2 className="font-semibold">Conversations</h2>
            </div>
            <p className="mt-1 text-xs text-foreground/45">Messenger customers, most recent first</p>
          </div>
          <div className="max-h-[540px] overflow-y-auto">
            {!conversations.length ? (
              <p className="p-6 text-sm text-foreground/45">No Messenger conversations yet.</p>
            ) : null}
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelectedId(conversation.id)}
                className={`w-full border-b border-line px-4 py-3 text-left ${
                  conversation.id === selectedId ? "bg-accent/[0.08]" : "hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <UserRound size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{conversation.customer.name}</p>
                      {conversation.customer.isVip ? (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-black">VIP</span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-foreground/45">
                      {conversation.lastMessage ?? "Start a conversation"}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[620px] flex-col">
          <div className="border-b border-line px-5 py-4">
            <p className="text-sm font-semibold">{selected?.customer.name ?? "Select a conversation"}</p>
            <p className="text-xs text-foreground/45">
              {selected?.customer.phoneNumber ?? selected?.customer.messengerPsid ?? ""}
              {selected?.customer.totalOrders ? ` · ${selected.customer.totalOrders} orders` : ""}
            </p>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {loadingMessages ? (
              <div className="flex justify-center p-8">
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : null}
            {!loadingMessages && !messages.length ? (
              <p className="text-sm text-foreground/45">No messages yet.</p>
            ) : null}
            {messages.map((message) => {
              const mine = message.direction === "outbound";
              return (
                <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                      mine ? "rounded-br-md bg-accent text-black" : "rounded-bl-md bg-white/[0.07] text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    <p className="mt-1 text-[10px] opacity-50">
                      {new Date(message.createdAt).toLocaleString()}
                      {message.aiIntent ? ` · ${message.aiIntent}` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-line p-4">
            {error ? <p className="mb-2 text-xs text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Reply to this customer..."
                disabled={!selected?.customer.messengerPsid || sending}
              />
              <Button type="button" onClick={() => void send()} disabled={!draft.trim() || !selected?.customer.messengerPsid || sending}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send
              </Button>
            </div>
          </div>
        </section>
      </div>
    </Card>
  );
}
