"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Download,
  FileText,
  Image as ImageIcon,
  Inbox,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { socket } from "@/lib/socket";

type Customer = {
  id: string;
  name: string;
  phoneNumber?: string | null;
  messengerPsid?: string | null;
  isVip?: boolean;
  totalOrders?: number;
};
type Conversation = { id: string; lastMessage?: string | null; updatedAt: string; customer: Customer };
type MessageAttachment = { type?: string; url?: string; title?: string; name?: string; payload?: { url?: string }; file_url?: string; image_data?: { url?: string } };
type Message = { id: string; direction: "inbound" | "outbound"; content: string; type?: string; rawPayload?: unknown; aiIntent?: string | null; createdAt: string };
type CustomerAiState = { globalEnabled: boolean; customerOverride: boolean | null; effectiveEnabled: boolean };

function getAttachments(message: Message): MessageAttachment[] {
  const raw = message.rawPayload as any;
  const attachments = raw?.message?.attachments ?? raw?.attachments;
  if (Array.isArray(attachments)) return attachments;
  if (Array.isArray(attachments?.data)) return attachments.data;
  return [];
}

function attachmentUrl(attachment: MessageAttachment) {
  return attachment.url ?? attachment.payload?.url ?? attachment.file_url ?? attachment.image_data?.url ?? "";
}

function attachmentKind(attachment: MessageAttachment) {
  const type = (attachment.type ?? "").toLowerCase();
  if (type === "image" || type.startsWith("image/")) return "image";
  if (type === "video" || type.startsWith("video/")) return "video";
  if (type === "audio" || type.startsWith("audio/")) return "audio";
  return "file";
}

function MessageAttachments({ message }: { message: Message }) {
  const attachments = getAttachments(message);
  if (!attachments.length) return null;

  return (
    <div className="mb-2 space-y-2">
      {attachments.map((attachment, index) => {
        const url = attachmentUrl(attachment);
        const kind = attachmentKind(attachment);
        if (!url) {
          return <div key={index} className="rounded-xl border border-current/10 px-3 py-2 text-xs opacity-60"><FileText size={14} className="mr-2 inline" />Attachment</div>;
        }
        if (kind === "image") {
          return (
            <a key={index} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-current/10">
              <img src={url} alt={attachment.title ?? attachment.name ?? "Messenger attachment"} className="block max-h-[420px] w-full max-w-[520px] object-contain" loading="lazy" />
            </a>
          );
        }
        if (kind === "video") {
          return <video key={index} src={url} controls preload="metadata" className="max-h-[420px] max-w-[520px] rounded-xl" />;
        }
        if (kind === "audio") {
          return <audio key={index} src={url} controls className="max-w-full" />;
        }
        return (
          <a key={index} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-current/10 px-3 py-2.5 text-xs hover:bg-black/5">
            <FileText size={17} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{attachment.title ?? attachment.name ?? "Attachment"}</span>
            <Download size={14} className="shrink-0 opacity-60" />
          </a>
        );
      })}
    </div>
  );
}

const ALLOWED_FORMATTED_TAGS = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "CODE", "DEL", "EM", "H1", "H2", "H3", "H4", "H5", "H6",
  "HR", "LI", "OL", "P", "PRE", "S", "STRONG", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD",
  "TR", "UL",
]);

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function markdownToHtml(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeLines: string[] = [];

  const closeLists = () => {
    if (inUl) { output.push("</ul>"); inUl = false; }
    if (inOl) { output.push("</ol>"); inOl = false; }
  };

  const inline = (text: string) => {
    let result = escapeHtml(text);
    result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
    result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    result = result.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    result = result.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    result = result.replace(/_([^_]+)_/g, "<em>$1</em>");
    result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noreferrer\">$1</a>");
    return result;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```") ) {
      if (inCode) {
        output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeLists();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*•]\s+(.+)$/);
    if (unordered) {
      if (!inUl) { closeLists(); output.push("<ul>"); inUl = true; }
      output.push(`<li>${inline(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      if (!inOl) { closeLists(); output.push("<ol>"); inOl = true; }
      output.push(`<li>${inline(ordered[1])}</li>`);
      continue;
    }

    if (!line.trim()) {
      closeLists();
      continue;
    }

    closeLists();
    output.push(`<p>${inline(line)}</p>`);
  }

  if (inCode) output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  closeLists();
  return output.join("");
}

function sanitizeFormattedHtml(value: string) {
  if (typeof window === "undefined") return escapeHtml(value).replace(/\n/g, "<br />");

  const parser = new DOMParser();
  const document = parser.parseFromString(value, "text/html");
  const clean = document.createElement("div");

  const appendNode = (node: Node, parent: HTMLElement) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent ?? ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    if (!ALLOWED_FORMATTED_TAGS.has(element.tagName)) {
      element.childNodes.forEach((child) => appendNode(child, parent));
      return;
    }

    const safe = document.createElement(element.tagName.toLowerCase());
    if (element.tagName === "A") {
      const href = element.getAttribute("href") ?? "";
      try {
        const url = new URL(href, window.location.origin);
        if (url.protocol === "http:" || url.protocol === "https:") {
          safe.setAttribute("href", url.href);
          safe.setAttribute("target", "_blank");
          safe.setAttribute("rel", "noreferrer noopener");
        }
      } catch {
        // Ignore unsafe/invalid links.
      }
    }
    element.childNodes.forEach((child) => appendNode(child, safe));
    parent.appendChild(safe);
  };

  document.body.childNodes.forEach((node) => appendNode(node, clean));
  return clean.innerHTML;
}

function FormattedMessage({ content }: { content: string }) {
  const html = useMemo(() => {
    const hasSupportedHtml = /<\/?(?:h[1-6]|p|ul|ol|li|strong|b|em|i|code|pre|table|thead|tbody|tfoot|tr|th|td|a|br|hr|blockquote|del|s)\b/i.test(content);
    const source = hasSupportedHtml ? content : markdownToHtml(content);
    return sanitizeFormattedHtml(source);
  }, [content]);

  return (
    <div
      className="formatted-message break-words leading-relaxed [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-current/20 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-bold [&_h4]:mb-1 [&_h4]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol]:my-2 [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/10 [&_pre]:p-2 [&_pre]:text-xs [&_strong]:font-semibold [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-current/10 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-current/10 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_thead]:bg-black/5 [&_ul]:my-2"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function InboxList({ initialConversations }: { initialConversations: Conversation[] }) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState(initialConversations[0]?.id ?? "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(Boolean(initialConversations[0]?.id));
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [customerAiState, setCustomerAiState] = useState<CustomerAiState | null>(null);
  const [savingAi, setSavingAi] = useState(false);
  const messagesRequestId = useRef(0);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const selected = useMemo(() => conversations.find((item) => item.id === selectedId), [conversations, selectedId]);
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) => `${conversation.customer.name} ${conversation.lastMessage ?? ""}`.toLowerCase().includes(query));
  }, [conversations, search]);

  useEffect(() => {
    if (!selectedId) {
      setCustomerAiState(null);
      return;
    }
    void loadCustomerAiState(selected?.customer.id ?? "");
  }, [selectedId, selected?.customer.id]);

  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId);
    const timer = window.setInterval(() => void loadMessages(selectedId, true), 3000);
    return () => window.clearInterval(timer);
  }, [selectedId]);

  // Polling restored as a fallback: the API here shows clear serverless
  // cold-start behavior (a fresh process on effectively every request, seen
  // repeatedly across production logs), which is a genuinely hostile
  // environment for a persistent Socket.IO connection to stay alive in.
  // A prior change trusted the socket as the sole sync mechanism and removed
  // this polling entirely - if the socket is the unreliable part, that
  // makes delays worse, not better. Socket events still make updates feel
  // instant when the connection happens to be up; polling guarantees a
  // worst-case few-second staleness regardless of the socket's state.
  useEffect(() => {
    const timer = window.setInterval(() => void loadConversations(true), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleNotification = (payload: unknown) => {
      if (!isMessengerNotification(payload)) return;
      void loadConversations(true);
      const conversationId = payload.payload?.conversationId;
      if (conversationId && conversationId === selectedIdRef.current) {
        void loadMessages(conversationId, true);
      }
    };

    socket.on("notifications.created", handleNotification);
    return () => {
      socket.off("notifications.created", handleNotification);
    };
  }, []);

  async function loadConversations(silent = false) {
    try {
      const result = await apiFetch<Conversation[]>("/messenger/conversations");
      setConversations(result);
      setSelectedId((current) => current && result.some((conversation) => conversation.id === current) ? current : result[0]?.id ?? "");
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Unable to load conversations.");
    }
  }

  async function loadCustomerAiState(customerId: string) {
    if (!customerId) return;
    try {
      const result = await apiFetch<CustomerAiState>(`/messenger/ai/customers/${customerId}`);
      setCustomerAiState(result);
    } catch (err) {
      setCustomerAiState(null);
      setError(err instanceof Error ? err.message : "Unable to load customer AI state.");
    }
  }

  async function toggleCustomerAi() {
    if (!selected?.customer.id || !customerAiState || savingAi) return;
    setSavingAi(true); setError("");
    const nextEnabled = !customerAiState.effectiveEnabled;
    try {
      const result = await apiFetch<CustomerAiState>(`/messenger/ai/customers/${selected.customer.id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: nextEnabled })
      });
      setCustomerAiState(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update customer AI switch.");
    } finally { setSavingAi(false); }
  }

  async function syncMetaHistory() {
    if (syncing) return;
    setSyncing(true); setError(""); setSyncMessage("");
    try {
      const result = await apiFetch<{ conversationsSeen: number; conversationsImported: number; messagesImported: number }>("/messenger/sync?maxConversations=100&maxMessagesPerConversation=1000", { method: "POST" });
      await loadConversations();
      setSyncMessage(`Synced ${result.conversationsImported} conversations and ${result.messagesImported} messages from Meta.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sync Messenger history.");
    } finally { setSyncing(false); }
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
      if (requestId === messagesRequestId.current && id === selectedId && !silent) setError(err instanceof Error ? err.message : "Unable to load messages.");
    } finally { if (!silent) setLoadingMessages(false); }
  }

  async function send() {
    const text = draft.trim();
    const psid = selected?.customer.messengerPsid;
    if (!text || !psid || sending) return;
    setSending(true);
    try {
      await apiFetch("/messenger/send", { method: "POST", body: JSON.stringify({ recipientPsid: psid, text }) });
      setDraft(""); await loadMessages(selectedId, true); await loadConversations(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to send message."); }
    finally { setSending(false); }
  }

  function selectConversation(id: string) { setSelectedId(id); setMobileChatOpen(true); setError(""); }
  function reconnectMeta() { window.location.href = `${API_URL}/messenger/auth/connect`; }

  return (
    <Card className="overflow-hidden border-line/80 bg-background/80 p-0 shadow-xl shadow-black/5">
      <div className="flex h-[calc(100dvh-180px)] min-h-[560px] max-h-[900px] md:h-[720px]">
        <aside className={`w-full shrink-0 bg-black/[0.02] md:block md:w-[330px] md:border-r ${mobileChatOpen ? "hidden" : "block"}`}>
          <div className="flex h-full flex-col">
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <div><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent"><Inbox size={17} /></span><div><h2 className="text-sm font-semibold">Inbox</h2><p className="text-[11px] text-foreground/45">{conversations.length} conversations</p></div></div></div>
                <div className="flex items-center gap-1.5"><Button type="button" variant="outline" size="sm" className="h-9 px-2.5 sm:px-3" onClick={reconnectMeta} title="Reconnect the Empanada Hauz Facebook Page"><Link2 size={14} /><span className="hidden sm:inline">Reconnect</span></Button><Button type="button" variant="outline" size="sm" className="h-9 px-2.5 sm:px-3" onClick={() => void syncMetaHistory()} disabled={syncing} title="Sync historical Messenger conversations and messages from Meta">{syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}<span className="hidden sm:inline">{syncing ? "Syncing..." : "Sync Meta"}</span></Button></div>
              </div>
              <div className="relative mt-4"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations..." className="h-10 pl-9" /></div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {!filteredConversations.length ? <div className="flex h-full flex-col items-center justify-center px-8 text-center"><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5 text-foreground/35"><MessageCircle size={22} /></span><p className="text-sm font-medium">{search ? "No matches" : "No conversations yet"}</p><p className="mt-1 text-xs text-foreground/45">{search ? "Try another customer or message." : "Messenger conversations will appear here."}</p></div> : filteredConversations.map((conversation) => { const active = conversation.id === selectedId; return <button key={conversation.id} type="button" onClick={() => selectConversation(conversation.id)} className={`group w-full border-b border-line/70 px-4 py-3.5 text-left transition-colors sm:px-5 ${active ? "bg-accent/[0.09]" : "hover:bg-foreground/[0.035]"}`}><div className="flex gap-3"><div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${active ? "bg-accent/15 text-accent" : "bg-foreground/5 text-foreground/50"}`}><UserRound size={17} />{active ? <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent" /> : null}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-sm font-semibold">{conversation.customer.name}</p>{conversation.customer.isVip ? <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">VIP</span> : null}</div><div className="mt-1 flex items-center justify-between gap-2"><p className="min-w-0 truncate text-xs text-foreground/45">{conversation.lastMessage ?? "Start a conversation"}</p><span className="shrink-0 text-[10px] text-foreground/30">{new Date(conversation.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div></div></div></button>; })}
            </div>
          </div>
        </aside>

        <section className={`min-w-0 flex-1 flex-col bg-background ${mobileChatOpen ? "flex" : "hidden md:flex"}`}>
          <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0 md:hidden" onClick={() => setMobileChatOpen(false)} aria-label="Back to conversations"><ArrowLeft size={18} /></Button>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"><UserRound size={16} /></div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{selected?.customer.name ?? "Select a conversation"}</p><p className="truncate text-[11px] text-foreground/45">{selected?.customer.phoneNumber ?? selected?.customer.messengerPsid ?? ""}{selected?.customer.totalOrders ? ` · ${selected.customer.totalOrders} orders` : ""}</p></div>
            {selected?.customer.isVip ? <span className="hidden rounded-full bg-accent px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-black sm:inline-flex">VIP customer</span> : null}
            {selected && customerAiState ? (
              <button
                type="button"
                onClick={() => void toggleCustomerAi()}
                disabled={savingAi}
                aria-label={`${customerAiState.effectiveEnabled ? "Turn off" : "Turn on"} AI for ${selected.customer.name}`}
                title={customerAiState.effectiveEnabled ? "AI is replying automatically. Click to take manual control." : "AI is off for this customer. Click to enable automatic replies."}
                className={`flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${customerAiState.effectiveEnabled ? "border-accent/30 bg-accent/10 text-foreground" : "border-line bg-foreground/[0.04] text-foreground/55"}`}
              >
                <Bot size={13} className={customerAiState.effectiveEnabled ? "text-accent" : "text-foreground/45"} />
                <span className="hidden sm:inline">AI</span>
                <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${customerAiState.effectiveEnabled ? "bg-accent" : "bg-foreground/20"}`}>
                  <span className={`h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform ${customerAiState.effectiveEnabled ? "translate-x-4" : "translate-x-1"}`} />
                </span>
                <span className="hidden text-[10px] sm:inline">{savingAi ? "..." : customerAiState.effectiveEnabled ? "ON" : "OFF"}</span>
              </button>
            ) : null}
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 sm:p-5">
            {loadingMessages ? <div className="flex justify-center p-8"><Loader2 className="animate-spin text-foreground/40" size={20} /></div> : null}
            {!loadingMessages && !messages.length ? <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center"><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent"><MessageCircle size={22} /></span><p className="text-sm font-medium">No messages yet</p><p className="mt-1 text-xs text-foreground/45">Send a message to start the conversation.</p></div> : null}
            {messages.map((message) => { const mine = message.direction === "outbound"; return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[72%] sm:px-4 ${mine ? "rounded-br-md bg-accent text-black" : "rounded-bl-md bg-foreground/[0.07] text-foreground"}`}><MessageAttachments message={message}/>{message.content && message.content !== "[Attachment]" ? <FormattedMessage content={message.content} /> : null}<p className="mt-1.5 text-[10px] opacity-50">{new Date(message.createdAt).toLocaleString()}{message.aiIntent ? ` · ${message.aiIntent}` : ""}</p></div></div>; })}
          </div>
          <div className="shrink-0 border-t border-line bg-background/95 p-3 backdrop-blur sm:p-4">{syncMessage ? <p className="mb-2 px-1 text-xs text-accent">{syncMessage}</p> : null}{error ? <p className="mb-2 px-1 text-xs text-danger">{error}</p> : null}<div className="flex items-end gap-2"><Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={selected ? "Reply to this customer..." : "Select a conversation..."} disabled={!selected?.customer.messengerPsid || sending} className="h-11 min-w-0" /><Button type="button" onClick={() => void send()} disabled={!draft.trim() || !selected?.customer.messengerPsid || sending} className="h-11 shrink-0 px-3 sm:px-4" aria-label="Send message">{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}<span className="hidden sm:inline">Send</span></Button></div><p className="mt-1.5 hidden px-1 text-[10px] text-foreground/30 sm:block">Press Enter to send</p></div>
        </section>
      </div>
    </Card>
  );
}

function isMessengerNotification(
  value: unknown
): value is { type: string; payload?: { conversationId?: string } } {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  const type = (value as { type?: unknown }).type;
  return type === "messenger.message_received" || type === "messenger.message_sent";
}
