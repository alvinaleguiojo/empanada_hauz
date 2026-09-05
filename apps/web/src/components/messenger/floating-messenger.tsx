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
